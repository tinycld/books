import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'

interface DiscardDialogProps {
    isVisible: boolean
    onDiscard(): void
    onKeepEditing(): void
}

export function DiscardDialog({ isVisible, onDiscard, onKeepEditing }: DiscardDialogProps) {
    return (
        <Dialog
            isOpen={isVisible}
            onClose={onKeepEditing}
            title="Discard this entry?"
            testID="discard-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    You have changes that are not saved. They are lost if you leave.
                </Text>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onKeepEditing} label="Keep editing" />
                <Dialog.ActionButton
                    label="Discard"
                    onPress={onDiscard}
                    isDestructive
                    requiresServer={false}
                    testID="discard-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
