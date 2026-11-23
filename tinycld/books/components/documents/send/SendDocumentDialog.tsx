import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { useFocusEffect, useIsFocused } from 'expo-router'
import { type RefObject, useCallback, useState } from 'react'
import { ActivityIndicator, Platform, Text, type TextInputInstance, View } from 'react-native'
import { useDocumentSend } from '../../../hooks/useDocumentSend'
import { useEmailStatus } from '../../../hooks/useEmailStatus'
import { useFocusOnOpen } from '../../../hooks/useFocusOnOpen'
import { useSendDialogData } from '../../../hooks/useSendDialogData'
import { type DocumentSendTarget, useDocumentSendStore } from '../../../stores/document-send-store'
import { DialogLoadError } from '../../taxes/DialogLoadError'
import { DocumentInlineNotice } from '../DocumentInlineNotice'
import { type ReadySendData, SendDocumentForm } from './SendDocumentForm'
import { SendNotSetUp } from './SendNotSetUp'
import { sendDialogTitle } from './send-kinds'

const IS_WEB = Platform.OS === 'web'

const LOAD_ERROR = 'The document could not load.'
const NOT_FOUND = 'This document is no longer available.'

function ignore() {}

// While the reads load, or when one failed: Cancel and a disabled Send.
function WaitingFooter({ onClose }: { onClose: () => void }) {
    return (
        <Dialog.Footer>
            <Dialog.CancelButton onPress={onClose} testID="document-send-cancel" />
            <Dialog.ActionButton
                label="Send"
                onPress={ignore}
                isDisabled
                shortcut={DIALOG_SUBMIT_SHORTCUT}
                testID="document-send-submit"
            />
        </Dialog.Footer>
    )
}

function SendLoading({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <>
            <Dialog.Body>
                <View testID="document-send-loading" className="items-center gap-3 py-6">
                    <ActivityIndicator size="small" color={color} />
                    <Text className="text-sm text-muted-foreground">Loading…</Text>
                </View>
            </Dialog.Body>
            <WaitingFooter onClose={onClose} />
        </>
    )
}

function SendLoadFailed({
    isVisible,
    onRetry,
    onClose,
}: {
    isVisible: boolean
    onRetry: () => void
    onClose: () => void
}) {
    if (!isVisible) return null
    return (
        <>
            <Dialog.Body>
                <DialogLoadError
                    isVisible
                    testIdPrefix="document-send"
                    testID="document-send-load-error"
                    message={LOAD_ERROR}
                    onRetry={onRetry}
                />
            </Dialog.Body>
            <WaitingFooter onClose={onClose} />
        </>
    )
}

// The document (or the customer it names) is gone once its read settled: nothing to send and
// nothing to retry, so the footer holds only Close.
function SendNotFound({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }) {
    if (!isVisible) return null
    return (
        <>
            <Dialog.Body>
                <DocumentInlineNotice testID="document-send-not-found" message={NOT_FOUND} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onClose} label="Close" testID="document-send-close" />
            </Dialog.Footer>
        </>
    )
}

type SendDialogData = ReturnType<typeof useSendDialogData>

// The reads narrowed for the form: every one is there once the status is 'ready'.
function readyDataOf(data: SendDialogData): ReadySendData | null {
    const { record, emailRecord, customer, settings, organizationName } = data
    // A document with no customer (a walk-in receipt) is ready without one.
    if (!record || !emailRecord || !settings) return null
    return { record, emailRecord, customer, settings, organizationName }
}

// The token of the document's customer page; '' for a kind with none or while it loads.
function tokenOf(data: SendDialogData): string {
    const emailRecord = data.emailRecord
    if (emailRecord?.kind === 'invoice' || emailRecord?.kind === 'estimate') {
        return emailRecord.record.public_token
    }
    return ''
}

// The dialog of one open: mounted while the store names a document for this screen, so the
// form and the editor start from the starting texts each time. `returnFocus` (a queued open
// only) is core Dialog's `onRestoreFocus`: core calls it one frame after the close when
// nothing claimed the focus, in place of its own restore to the opener, which is gone.
function OpenSendDialog({
    target,
    returnFocus,
}: {
    target: DocumentSendTarget
    returnFocus: (() => void) | undefined
}) {
    const data = useSendDialogData(target)
    const close = useDocumentSendStore(state => state.close)
    const send = useDocumentSend()
    const { status } = data
    const ready = status === 'ready' ? readyDataOf(data) : null
    const isReady = ready !== null
    // To takes the focus when the form first draws (web only: a native keyboard would
    // cover the Sheet).
    const focus = useFocusOnOpen(IS_WEB && isReady)
    // The dialog does not close from the Send press until the request settles (spec §3.2
    // footer): the form reads the editor first (a WebView round trip on native), then sends.
    const [isPreparing, setPreparing] = useState(false)
    const onClose = send.isPending || isPreparing ? ignore : close
    const number = data.record?.number ?? ''
    const title = sendDialogTitle(target.kind, number)
    const isLoading = status === 'loading'
    const isFailed = status === 'failed'
    const isNotSetUp = status === 'not-set-up'
    const isNotFound = status === 'not-found'
    const token = tokenOf(data)
    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={title}
            size="md"
            testID="document-send-dialog"
            initialFocusRef={focus.ref}
            onRestoreFocus={returnFocus}
        >
            <SendLoading isVisible={isLoading} onClose={close} />
            <SendLoadFailed isVisible={isFailed} onRetry={data.retry} onClose={close} />
            <SendNotFound isVisible={isNotFound} onClose={close} />
            <SendNotSetUp
                isVisible={isNotSetUp}
                kind={target.kind}
                documentId={target.id}
                number={number}
                token={token}
                onClose={close}
            />
            <SendReadySlot
                ready={ready}
                kind={target.kind}
                send={send}
                toRef={focus.ref}
                isPreparing={isPreparing}
                onPreparingChange={setPreparing}
                onClose={close}
            />
        </Dialog>
    )
}

function SendReadySlot({
    ready,
    kind,
    send,
    toRef,
    isPreparing,
    onPreparingChange,
    onClose,
}: {
    ready: ReadySendData | null
    kind: DocumentSendTarget['kind']
    send: ReturnType<typeof useDocumentSend>
    toRef: RefObject<TextInputInstance | null>
    isPreparing: boolean
    onPreparingChange: (isPreparing: boolean) => void
    onClose: () => void
}) {
    if (!ready) return null
    return (
        <SendDocumentForm
            kind={kind}
            data={ready}
            send={send}
            toRef={toRef}
            isPreparing={isPreparing}
            onPreparingChange={onPreparingChange}
            onClose={onClose}
        />
    )
}

// The store outlives the screen: close this screen's dialog when the screen loses focus or
// unmounts (lesson 3), and drop a queued send of this screen's document, so a later visit
// does not open a stale dialog. A new form's screen has no `recordId`: its save's queued
// send is for the saved route's screen, which mounts before the new one unmounts.
function useCloseOnBlur(owner: string, recordId: string | undefined) {
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useDocumentSendStore.getState()
                if (recordId !== undefined) store.cancelQueued(recordId)
                if (store.target === null || store.owner !== owner) return
                store.close()
            },
            [owner, recordId]
        )
    )
}

// The document this screen's dialog is open on: the store's target when this screen opened
// it, else a queued send of this screen's document once it can be sent, on the focused
// screen only (a second visit of the same document leaves the first screen mounted under
// it, lesson 38).
function openTargetOf(input: {
    target: DocumentSendTarget | null
    storeOwner: string
    queued: DocumentSendTarget | null
    owner: string
    recordId: string | undefined
    isSendable: boolean
    isFocused: boolean
}): DocumentSendTarget | null {
    const { target, storeOwner, queued, owner, recordId, isSendable } = input
    if (target !== null && storeOwner === owner) return target
    const isQueuedHere = queued !== null && queued.id === recordId
    if (isQueuedHere && isSendable && input.isFocused) return queued
    return null
}

interface SendDocumentDialogProps {
    // The `useId()` of the screen that mounts this dialog.
    owner: string
    // The document this screen shows, and whether it can be sent now: the dialog of a
    // send queued before the document's post or save (checkpoint 4) opens on it.
    recordId?: string
    isSendable?: boolean
    // Focuses the screen's return target (its own send control, else a control that is
    // drawn) after a queued dialog closes: the queued send's opener was on the screen the
    // route replace unmounted. Core can call it after this screen is gone too, so it
    // focuses only controls under the screen's own root (a null root does nothing).
    returnFocus?: () => void
}

/**
 * The Send dialog (spec §3.2): a core Dialog of size md (a Sheet on a phone) titled "Send
 * <noun> <number>", over the screen that opened it. It is open while useDocumentSendStore
 * names a target for this `owner`, or while it holds a queued send of this screen's
 * `recordId` that `isSendable` allows. By useSendDialogData's status: a spinner and
 * "Loading…", the load error with Retry (one recovery of the failed reads), the notice of
 * a document that is gone with Close only (SendNotFound), the not-set-up notice with the
 * link buttons (SendNotSetUp), or the form (SendDocumentForm), which mounts only once
 * every read has landed. It warms the email status read on the screen, so an open dialog
 * finds it answered. When a queued dialog closes, `returnFocus` gives the focus back to
 * the screen (core Dialog's `onRestoreFocus`).
 */
export function SendDocumentDialog({
    owner,
    recordId,
    isSendable = false,
    returnFocus,
}: SendDocumentDialogProps) {
    useEmailStatus()
    useCloseOnBlur(owner, recordId)
    const isFocused = useIsFocused()
    const target = useDocumentSendStore(state => state.target)
    const storeOwner = useDocumentSendStore(state => state.owner)
    const queued = useDocumentSendStore(state => state.queued)
    const openTarget = openTargetOf({
        target,
        storeOwner,
        queued,
        owner,
        recordId,
        isSendable,
        isFocused,
    })
    if (!openTarget) return null
    // Only a queued open lost its opener; one this screen opened gets core's restore.
    const onClosedFocus = openTarget === queued ? returnFocus : undefined
    return <OpenSendDialog key={openTarget.id} target={openTarget} returnFocus={onClosedFocus} />
}
