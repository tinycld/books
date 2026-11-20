import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import { RefusalSummary } from './RefusalSummary'

interface VoidDialogProps {
    isVisible: boolean
    // What the title names: "1004" for an entry, "invoice 1004" for an invoice.
    entryNumber: string
    // The confirm button's label: "Void entry" unless the caller voids something else.
    confirmLabel?: string
    // What the void does, when the caller's record says more than an entry's text.
    body?: string
    isPending: boolean
    // The confirm is idle for a reason of the caller's (writes are not available); false
    // unless the caller passes it.
    isConfirmDisabled?: boolean
    // The server's refusal, kept above this dialog so it survives an optimistic rollback.
    errorMessage: string | null
    onConfirm(): void
    onCancel(): void
}

const ENTRY_BODY = 'A reversing entry is posted in the original period. The number is kept.'

function ignore() {}

export function VoidDialog({
    isVisible,
    entryNumber,
    confirmLabel = 'Void entry',
    body = ENTRY_BODY,
    isPending,
    isConfirmDisabled = false,
    errorMessage,
    onConfirm,
    onCancel,
}: VoidDialogProps) {
    const isConfirmIdle = isPending || isConfirmDisabled
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title={`Void ${entryNumber}?`}
            testID="void-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{body}</Text>
                <RefusalSummary message={errorMessage} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isPending} />
                <Dialog.ActionButton
                    label={confirmLabel}
                    onPress={isConfirmIdle ? ignore : onConfirm}
                    isDisabled={isConfirmIdle}
                    isDestructive
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="void-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
