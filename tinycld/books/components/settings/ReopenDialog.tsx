import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import { formatDay } from '../../lib/register-range'

// Exists as its own dialog because ConfirmDialog has no testID on its buttons, and core cannot change here.
interface ReopenDialogProps {
    isVisible: boolean
    oldDate: string
    onConfirm: () => void
    onCancel: () => void
}

export function ReopenDialog({ isVisible, oldDate, onConfirm, onCancel }: ReopenDialogProps) {
    if (!isVisible) return null
    return (
        <Dialog isOpen onClose={onCancel} title="Reopen closed periods?" hasCloseButton={false}>
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    People can post entries dated on or before {formatDay(oldDate)} again.
                </Text>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} testID="books-settings-reopen-cancel" />
                <Dialog.ActionButton
                    label="Confirm"
                    onPress={onConfirm}
                    testID="books-settings-reopen-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
