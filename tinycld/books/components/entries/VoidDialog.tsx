import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import { RefusalSummary } from './RefusalSummary'

interface VoidDialogProps {
    isVisible: boolean
    // What the title names: "1004" for an entry, "invoice 1004" for an invoice.
    entryNumber: string
    // The confirm button's label: "Void entry" unless the caller voids something else.
    confirmLabel?: string
    isPending: boolean
    // The server's refusal, kept above this dialog so it survives an optimistic rollback.
    errorMessage: string | null
    onConfirm(): void
    onCancel(): void
}

function ignore() {}

export function VoidDialog({
    isVisible,
    entryNumber,
    confirmLabel = 'Void entry',
    isPending,
    errorMessage,
    onConfirm,
    onCancel,
}: VoidDialogProps) {
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title={`Void ${entryNumber}?`}
            testID="void-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    A reversing entry is posted in the original period. The number is kept.
                </Text>
                <RefusalSummary message={errorMessage} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isPending} />
                <Dialog.ActionButton
                    label={confirmLabel}
                    onPress={isPending ? ignore : onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="void-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
