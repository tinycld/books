import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'

interface DeleteDraftDialogProps {
    isVisible: boolean
    onConfirm(): void
    onCancel(): void
    isPending: boolean
    // The server's refusal, shown until the next attempt.
    errorMessage?: string | null
    // The words and ids of another record's delete (an estimate's); the defaults are a
    // draft's.
    title?: string
    body?: string
    actionLabel?: string
    // The prefix of the dialog's ids: `<prefix>-dialog`, `<prefix>-confirm` and
    // `<prefix>-refusal`.
    testIdPrefix?: string
}

function ignore() {}

export function DeleteDraftDialog({
    isVisible,
    onConfirm,
    onCancel,
    isPending,
    errorMessage = null,
    title = 'Delete this draft?',
    body = 'The draft and its lines are deleted. This cannot be undone.',
    actionLabel = 'Delete draft',
    testIdPrefix = 'delete-draft',
}: DeleteDraftDialogProps) {
    const ids = {
        dialog: `${testIdPrefix}-dialog`,
        confirm: `${testIdPrefix}-confirm`,
        refusal: `${testIdPrefix}-refusal`,
    }
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title={title}
            testID={ids.dialog}
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{body}</Text>
                <ErrorText message={errorMessage} testID={ids.refusal} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isPending} />
                <Dialog.ActionButton
                    label={actionLabel}
                    onPress={isPending ? ignore : onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID={ids.confirm}
                />
            </Dialog.Footer>
        </Dialog>
    )
}

function ErrorText({ message, testID }: { message: string | null; testID: string }) {
    if (!message) return null
    return (
        <Text accessibilityRole="alert" testID={testID} className="text-sm text-danger">
            {message}
        </Text>
    )
}
