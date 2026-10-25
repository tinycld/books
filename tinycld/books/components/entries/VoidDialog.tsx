import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import { RefusalSummary } from './RefusalSummary'

interface VoidDialogProps {
    isVisible: boolean
    entryNumber: string
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
                    label="Void entry"
                    onPress={isPending ? ignore : onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    testID="void-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
