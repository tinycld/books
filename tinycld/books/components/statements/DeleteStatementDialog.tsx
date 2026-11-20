import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { STATEMENT_DELETE_MESSAGE, statementDeleteTitle } from '../../lib/statement-texts'

interface DeleteStatementDialogProps {
    number: string
    isOpen: boolean
    isDeleting: boolean
    onClose: () => void
    onConfirm: () => void
}

/**
 * The Delete confirm of a statement (statements spec §3.8): core ConfirmDialog "Delete
 * statement <number>?" with "The customer's balance does not change.", Cancel (Esc) and
 * Delete (⌘↵). Both answers are idle while the delete runs; Delete is idle while writes
 * cannot reach the server (core).
 */
export function DeleteStatementDialog({
    number,
    isOpen,
    isDeleting,
    onClose,
    onConfirm,
}: DeleteStatementDialogProps) {
    const title = statementDeleteTitle(number)
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title={title}
            message={STATEMENT_DELETE_MESSAGE}
            confirmLabel="Delete"
            isDestructive
            isSubmitting={isDeleting}
            confirmTestID="statement-delete-confirm"
        />
    )
}
