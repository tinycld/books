import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import type { BatchSend } from '../../hooks/useBatchSend'

function ignore() {}

const SENDING_LABEL = 'Sending…'

function SkippedLine({ text }: { text: string | null }) {
    if (text === null) return null
    return (
        <Text testID="batch-send-skipped" className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

// The dialog's refusal: more than 200 sendable rows (batchSendCopy), else the refused
// request (useBatchSend).
function RefusalLine({ text }: { text: string | null }) {
    if (text === null) return null
    return (
        <Text testID="batch-send-refusal" className="text-sm text-destructive">
            {text}
        </Text>
    )
}

// Close alone when email is not set up (`confirmLabel` null); else Cancel and the confirm
// "Send <n>" (⌘↵), disabled with no sendable row, above the limit, or while the send runs.
function BatchSendFooter({ batch }: { batch: BatchSend }) {
    const { copy, isPending } = batch
    if (copy.confirmLabel === null) {
        return (
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={batch.close}
                    label="Close"
                    testID="batch-send-close"
                />
            </Dialog.Footer>
        )
    }
    const label = isPending ? SENDING_LABEL : copy.confirmLabel
    const isDisabled = isPending || !copy.isConfirmEnabled
    return (
        <Dialog.Footer>
            <Dialog.CancelButton
                onPress={batch.close}
                isDisabled={isPending}
                testID="batch-send-cancel"
            />
            <Dialog.ActionButton
                label={label}
                onPress={batch.confirm}
                isDisabled={isDisabled}
                shortcut={DIALOG_SUBMIT_SHORTCUT}
                testID="batch-send-confirm"
            />
        </Dialog.Footer>
    )
}

/**
 * The batch Send of a sales list (spec §3.3 "Batch", plan decision 6): a core Dialog with
 * no close button, as core ConfirmDialog draws one, so its confirm can be disabled alone
 * and it can hold Close alone. "Send 12 documents?", "Each goes to the email address on
 * the document." (or "Email sending is not set up."), the skipped line, and the refusal
 * (more than 200, or a refused request, which keeps the dialog open). Open while the send
 * store's `batchSend` names this list (useBatchSend `isOpen`); Escape and the backdrop
 * close it, except while its send runs.
 */
export function BatchSendDialog({ batch }: { batch: BatchSend }) {
    const { copy } = batch
    const onClose = batch.isPending ? ignore : batch.close
    const refusal = copy.refusal ?? batch.refusal
    return (
        <Dialog
            isOpen={batch.isOpen}
            onClose={onClose}
            title={copy.title}
            testID="batch-send-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body testID="batch-send-body">
                <Text className="text-sm text-foreground">{copy.body}</Text>
                <SkippedLine text={copy.skipped} />
                <RefusalLine text={refusal} />
            </Dialog.Body>
            <BatchSendFooter batch={batch} />
        </Dialog>
    )
}
