import { Dialog } from '@tinycld/core/ui/dialog'
import { useState } from 'react'
import { Text } from 'react-native'
import { useRemoveBankFile } from '../../hooks/useRemoveBankFile'
import { CloseOnMount } from './CloseOnMount'

interface RemoveBankFileDialogProps {
    fileId: string
    fileName: string
    // The file is no longer in the selected connection's files.
    isGone: boolean
    onClose(): void
}

function ignore() {}

function RemoveRefusal({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text testID="bank-remove-error" accessibilityRole="alert" className="text-sm text-danger">
            {message}
        </Text>
    )
}

// The delete is optimistic: the row leaves the list before the server answers. So the
// dialog closes itself for a missing file only until the user confirms; after that a
// refusal brings the row back and shows here.
export function RemoveBankFileDialog({
    fileId,
    fileName,
    isGone,
    onClose,
}: RemoveBankFileDialogProps) {
    const { confirm, isPending, refusal } = useRemoveBankFile({ fileId, onDone: onClose })
    const [isConfirmed, setConfirmed] = useState(false)
    if (isGone && !isConfirmed) return <CloseOnMount onClose={onClose} />
    const onConfirm = () => {
        setConfirmed(true)
        confirm()
    }
    return (
        <Dialog
            isOpen
            onClose={isPending ? ignore : onClose}
            title={`Remove ${fileName}?`}
            testID="bank-remove-dialog"
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    The uploaded file is deleted. Nothing in your books changes.
                </Text>
                <RemoveRefusal message={refusal} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={isPending}
                    testID="bank-remove-dialog-cancel"
                />
                <Dialog.ActionButton
                    label="Remove file"
                    onPress={onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    testID="bank-remove-dialog-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
