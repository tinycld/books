import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'

interface DeleteDraftDialogProps {
    isVisible: boolean
    onConfirm(): void
    onCancel(): void
    isPending: boolean
    // The server's refusal, shown until the next attempt.
    errorMessage?: string | null
}

function ignore() {}

export function DeleteDraftDialog({
    isVisible,
    onConfirm,
    onCancel,
    isPending,
    errorMessage = null,
}: DeleteDraftDialogProps) {
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title="Delete this draft?"
            testID="delete-draft-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    The draft and its lines are deleted. This cannot be undone.
                </Text>
                <ErrorText message={errorMessage} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isPending} />
                <Dialog.ActionButton
                    label="Delete draft"
                    onPress={isPending ? ignore : onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    testID="delete-draft-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

function ErrorText({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text accessibilityRole="alert" className="text-sm text-danger">
            {message}
        </Text>
    )
}
