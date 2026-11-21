import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, TextInput, useForm, zodResolver } from '@tinycld/core/ui/form'
import { Platform, Text } from 'react-native'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import { useStatementSend } from '../../hooks/useStatementSend'
import { writeRefusalText } from '../../lib/refusal'
import { rootErrorOnly } from '../../lib/root-errors'
import { type SendStatementValues, sendStatementSchema } from '../../lib/statement-schema'
import { statementAttachmentName, statementSentToast } from '../../lib/statement-texts'
import type { BooksStatements } from '../../types'

const IS_WEB = Platform.OS === 'web'
const TOAST_MS = 4000

type SendTarget = Pick<BooksStatements, 'id' | 'number' | 'email'>

interface SendStatementDialogProps {
    // The statement to send; null while none is chosen, or when it went away (deleted
    // elsewhere): the dialog then draws nothing.
    statement: SendTarget | null
    customerName: string
    customerEmail: string
    isOpen: boolean
    onClose: () => void
}

interface OpenSendDialogProps extends Omit<SendStatementDialogProps, 'statement' | 'isOpen'> {
    statement: SendTarget
}

// The dialog of one open: mounted while it is open, so To starts from the statement's
// address (else the customer's) each time.
function OpenSendDialog({ statement, customerName, customerEmail, onClose }: OpenSendDialogProps) {
    // To takes the focus at open (web only: a native keyboard would cover the Sheet).
    const focus = useFocusOnOpen(IS_WEB)
    const { send, isSending } = useStatementSend()
    const form = useForm<SendStatementValues>({
        resolver: zodResolver(sendStatementSchema),
        defaultValues: { to: statement.email === '' ? customerEmail : statement.email },
    })
    const { control, formState, handleSubmit, setError } = form
    const attachment = `Attachment: ${statementAttachmentName(statement.number, customerName)}`

    // A refused statement (the answer's `failed`) or a refused request shows in the summary,
    // and the dialog stays; a sent one closes it with the toast.
    const submit = handleSubmit(async ({ to }) => {
        try {
            const answer = await send([{ id: statement.id, to }])
            const failed = answer.failed.find(item => item.id === statement.id)
            if (failed) {
                setError('root', { type: 'server', message: failed.message })
                return
            }
        } catch (error) {
            setError('root', { type: 'server', message: writeRefusalText(error) })
            return
        }
        useToastStore.getState().addToast({
            title: statementSentToast(to),
            variant: 'success',
            duration: TOAST_MS,
        })
        onClose()
    })
    const onSend = () => void submit()
    const close = () => {
        if (!isSending) onClose()
    }
    const rootErrors = rootErrorOnly(formState.errors)
    const sendLabel = isSending ? 'Sending…' : 'Send'
    return (
        <Dialog
            isOpen
            onClose={close}
            title="Send statement"
            size="md"
            testID="statement-send-dialog"
            initialFocusRef={focus.ref}
        >
            <Dialog.Body>
                <TextInput
                    control={control}
                    name="to"
                    label="To"
                    testID="statement-send-to"
                    inputRef={focus.ref}
                    inputMode="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSending}
                />
                <Text className="text-sm text-muted-foreground">{attachment}</Text>
                <FormErrorSummary
                    testID="statement-send-errors"
                    errors={rootErrors}
                    showFieldNames={false}
                    isEnabled={formState.isSubmitted}
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={close}
                    isDisabled={isSending}
                    testID="statement-send-cancel"
                />
                <Dialog.ActionButton
                    label={sendLabel}
                    onPress={onSend}
                    isDisabled={isSending}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="statement-send-submit"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

/**
 * The Send statement dialog (statements spec §3.8): a core Dialog (a Sheet on a phone) with
 * To (one valid address, `sendStatementSchema`; filled with the statement's address, else
 * the customer's; focused at open), the line "Attachment: <file name>", Cancel (Esc) and
 * Send (⌘↵). Send posts the one statement to the send route (`useStatementSend`), which
 * files the sent row; a refusal shows in FormErrorSummary and the dialog stays. Send is idle
 * while writes cannot reach the server (core Dialog.ActionButton).
 */
export function SendStatementDialog({ statement, isOpen, ...rest }: SendStatementDialogProps) {
    if (!isOpen || statement === null) return null
    return <OpenSendDialog key={statement.id} statement={statement} {...rest} />
}
