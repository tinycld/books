import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'

interface DiscardDraftDialogProps {
    isOpen: boolean
    isDiscarding: boolean
    onClose: () => void
    onConfirm: () => void
}

export function DiscardDraftDialog({
    isOpen,
    isDiscarding,
    onClose,
    onConfirm,
}: DiscardDraftDialogProps) {
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="Discard this draft?"
            message="The draft and its saved balances are deleted. Posted entries are not changed."
            confirmLabel="Discard draft"
            isDestructive
            isSubmitting={isDiscarding}
        />
    )
}
