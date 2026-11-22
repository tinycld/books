import { RichTextToolbar } from '@tinycld/core/components/editor/RichTextToolbar'
import { useRichEditor } from '@tinycld/core/lib/editor/rich'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, TextInput, useForm, zodResolver } from '@tinycld/core/ui/form'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { Text, type TextInputInstance, View } from 'react-native'
import {
    DOCUMENT_SEND_ANSWER_UNREADABLE,
    type DocumentSendAnswer,
    type useDocumentSend,
} from '../../../hooks/useDocumentSend'
import { useSelectAllOnFocus } from '../../../hooks/useSelectAllOnFocus'
import type { useSendDialogData } from '../../../hooks/useSendDialogData'
import { documentEmail, documentEmailInputOf } from '../../../lib/document-email'
import {
    type DocumentSendValues,
    documentSendSchema,
    parseCc,
    type SendKind,
    sentToast,
} from '../../../lib/document-send'
import { todayIso } from '../../../lib/register-range'
import { rootErrorOnly } from '../../../lib/root-errors'
import { SendLinkButtons } from './SendLinkButtons'
import { SEND_DOCUMENT_KINDS } from './send-kinds'

// ⌥R puts the starting subject and message back, typed in the fields too (the dialog's
// modal scope).
const RESET_SHORTCUT = { keys: 'Alt+r', scope: 'modal', allowInInputs: true } as const

const SENT_TOAST_MS = 4000

type SendDialogData = ReturnType<typeof useSendDialogData>

// The dialog's reads once every one has landed (status 'ready').
export type ReadySendData = {
    record: NonNullable<SendDialogData['record']>
    emailRecord: NonNullable<SendDialogData['emailRecord']>
    // Undefined for a document with no customer (a walk-in receipt).
    customer: SendDialogData['customer']
    settings: NonNullable<SendDialogData['settings']>
    organizationName: string
}

interface SendDocumentFormProps {
    kind: SendKind
    data: ReadySendData
    send: ReturnType<typeof useDocumentSend>
    // To: the dialog focuses it when the form first draws (web).
    toRef: RefObject<TextInputInstance | null>
    // The dialog's state of a Send between its press and the mutation (the editor read):
    // the dialog reads it too, so it does not close then.
    isPreparing: boolean
    onPreparingChange: (isPreparing: boolean) => void
    // Closes the dialog: Cancel (disabled while sending) and a sent answer.
    onClose: () => void
}

function BodyError({ message }: { message: string | undefined }) {
    if (!message) return null
    return (
        <Text testID="document-send-body-error" className="text-sm text-destructive">
            {message}
        </Text>
    )
}

// A refusal stays in view (plan decision 9): its own strip between the scrolling body and
// the footer, drawn only once there is a refusal to show.
function ErrorStrip({ message, isEnabled }: { message: string | undefined; isEnabled: boolean }) {
    if (!isEnabled || !message) return null
    const errors = rootErrorOnly({ root: { message } })
    return (
        <View className="px-5 pt-3">
            <FormErrorSummary
                testID="document-send-errors"
                errors={errors}
                showFieldNames={false}
                isEnabled
            />
        </View>
    )
}

// The token of the document's customer page; '' for a kind with none.
function tokenOf(emailRecord: ReadySendData['emailRecord']): string {
    if (emailRecord.kind === 'invoice' || emailRecord.kind === 'estimate') {
        return emailRecord.record.public_token
    }
    return ''
}

/**
 * The Send dialog's form (spec §3.2), mounted once the document, the customer it names (if
 * any) and the settings have landed, so the starting subject and message (documentEmail of the TS
 * mirror) are complete at the editor's first mount: To (the document's email, else the
 * customer's; its text selected when it takes the focus), Cc, Subject, the "Message" label
 * with Reset message (⌥R), core RichTextToolbar over the rich-text body (useRichEditor),
 * the attachment line and the link buttons, the refusal strip, and Cancel (Esc) and Send
 * (⌘↵). Send reads the editor's HTML and text into `body` and `bodyText`, then one zod
 * schema (documentSendSchema) checks every field. While the request runs, the fields, Send
 * and Cancel are disabled and the dialog does not close (`isPreparing` from the press to
 * the mutation, then `send.isPending`; the dialog's `onClose` reads both).
 */
export function SendDocumentForm({
    kind,
    data,
    send,
    toRef,
    isPreparing,
    onPreparingChange,
    onClose,
}: SendDocumentFormProps) {
    const { record, emailRecord, customer, settings, organizationName } = data
    const doc = SEND_DOCUMENT_KINDS[kind]
    // The starting texts, computed once: they name no recipient, so typing in To or Cc
    // does not change them, and Reset message puts these back.
    const [start] = useState(() =>
        documentEmail(
            documentEmailInputOf({
                ...emailRecord,
                // Go documentEmailInputOf: '' for a document with no customer.
                customerName: customer?.display_name ?? '',
                settings,
                organizationName,
                today: todayIso(),
            })
        )
    )
    const startTo = record.email || customer?.email || ''
    const form = useForm<DocumentSendValues>({
        resolver: zodResolver(documentSendSchema),
        defaultValues: {
            to: startTo,
            cc: '',
            subject: start.subject,
            body: start.bodyHtml,
            // Send writes the editor's text here before the schema runs.
            bodyText: '',
        },
    })
    const { control, formState, getValues, handleSubmit, setError, setValue } = form
    // Send is taken from the first press: reading the editor (a WebView round trip on
    // native) comes before the mutation, so `send.isPending` alone lets a second press
    // through. The ref guards at once; the dialog's preparing state disables Send and
    // Cancel and keeps the dialog open.
    const isSubmitting = useRef(false)
    const isSending = send.isPending || isPreparing
    const selectTo = useSelectAllOnFocus(startTo)
    // The editor's ⌘↵ (native: the WebView takes the key) calls the latest submit.
    const submitRef = useRef<() => Promise<void>>(async () => {})
    const rich = useRichEditor({
        contentFormat: 'html',
        minHeight: 160,
        initialContent: start.bodyHtml,
        containerClassName: 'px-3 py-2',
        onSubmitShortcut: () => void submitRef.current(),
        // The dialog takes Escape and closes.
        onEscape: () => false,
    })
    const { editor, EditorComponent, commands, toolbarState } = rich

    const onAnswer = (answer: DocumentSendAnswer) => {
        const sent = answer.sent[0]
        if (sent) {
            onClose()
            useToastStore.getState().addToast({
                title: sentToast(doc.noun, record.number, sent.to),
                variant: 'success',
                duration: SENT_TOAST_MS,
            })
            return
        }
        const failed = answer.failed[0]
        // An answer with neither a sent row nor a failed item says nothing of the send.
        const message = failed?.message ?? DOCUMENT_SEND_ANSWER_UNREADABLE
        setError('root', { type: 'server', message })
    }
    const release = () => {
        isSubmitting.current = false
        onPreparingChange(false)
    }
    const onRefused = handleMutationErrorsWithForm({
        setError,
        getValues,
        rootMessage: true,
        operation: 'books.documents.send',
    })
    const sendValues = (values: DocumentSendValues) => {
        send.mutate(
            [
                {
                    kind,
                    id: record.id,
                    to: values.to.trim(),
                    cc: parseCc(values.cc),
                    subject: values.subject,
                    body: values.body,
                },
            ],
            { onSuccess: onAnswer, onError: onRefused, onSettled: release }
        )
    }
    // The body is not a registered input: its HTML and text go into the form, then the one
    // schema checks every field. A refused form, or an editor that cannot be read, frees
    // Send again; a request frees it when it settles.
    const submit = async () => {
        if (isSubmitting.current) return
        isSubmitting.current = true
        onPreparingChange(true)
        try {
            const [html, text] = await Promise.all([editor.getHTML(), editor.getText()])
            setValue('body', html)
            setValue('bodyText', text.trim())
            await handleSubmit(sendValues, release)()
        } catch (error) {
            release()
            onRefused(error)
        }
    }
    useLayoutEffect(() => {
        submitRef.current = submit
    })
    const onSend = () => void submit()
    const onReset = () => {
        setValue('subject', start.subject)
        editor.setContent(start.bodyHtml)
    }
    const sendLabel = isSending ? 'Sending…' : 'Send'
    const bodyError = formState.errors.body?.message
    const rootMessage = formState.errors.root?.message
    const token = tokenOf(emailRecord)
    return (
        <>
            <Dialog.Body>
                <TextInput
                    control={control}
                    name="to"
                    label="To"
                    testID="document-send-to"
                    inputRef={toRef}
                    inputMode="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSending}
                    selectTextOnFocus={selectTo.selectTextOnFocus}
                    onFocus={selectTo.onFocus}
                    onKeyPress={selectTo.onKeyPress}
                    onValueChange={selectTo.onTyped}
                    onBlur={selectTo.onBlur}
                />
                <TextInput
                    control={control}
                    name="cc"
                    label="Cc"
                    testID="document-send-cc"
                    placeholder="Addresses, separated by commas"
                    inputMode="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSending}
                />
                <TextInput
                    control={control}
                    name="subject"
                    label="Subject"
                    testID="document-send-subject"
                    editable={!isSending}
                />
                <View className="gap-1.5">
                    <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-foreground">Message</Text>
                        <ShortcutButton
                            label="Reset message"
                            shortcut={RESET_SHORTCUT}
                            onPress={onReset}
                            variant="link"
                            size="sm"
                            testID="document-send-reset"
                        />
                    </View>
                    <View className="overflow-hidden rounded-lg border border-border bg-background">
                        <View testID="document-send-toolbar">
                            <RichTextToolbar
                                commands={commands}
                                toolbarState={toolbarState}
                                className="border-b border-border"
                            />
                        </View>
                        <View testID="document-send-body">
                            <EditorComponent />
                        </View>
                    </View>
                    <BodyError message={bodyError} />
                </View>
                <SendLinkButtons
                    kind={kind}
                    documentId={record.id}
                    number={record.number}
                    token={token}
                />
            </Dialog.Body>
            <ErrorStrip message={rootMessage} isEnabled={formState.isSubmitted} />
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={isSending}
                    testID="document-send-cancel"
                />
                <Dialog.ActionButton
                    label={sendLabel}
                    onPress={onSend}
                    isDisabled={isSending}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="document-send-submit"
                />
            </Dialog.Footer>
        </>
    )
}
