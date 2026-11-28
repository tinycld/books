import type { BinActions } from '../../hooks/useBinActions'
import { type DeleteDialogLine, DeleteRecordDialog } from '../DeleteRecordDialog'

const DELETE_CONFIRM = { testID: 'bin-delete-confirm', label: 'Delete', isDestructive: true }

type DeletedBin = { id: string; name: string }

interface BinDeleteDialogProps {
    bin: DeletedBin | null
    actions: BinActions
    // This bin's refusal, or null.
    refusal: string | null
    onClose: () => void
    onDeleted: () => boolean
}

function linesOf(name: string, refusal: string | null): DeleteDialogLine[] {
    const question: DeleteDialogLine = {
        key: 'question',
        text: `Delete ${name}? This can't be undone.`,
        tone: 'plain',
    }
    if (refusal === null) return [question]
    return [question, { key: 'refusal', text: refusal, tone: 'error' }]
}

/**
 * The bin list's Delete (`bin-delete-dialog`; inventory-adjust spec §3.7). The server
 * refuses the delete of a bin that anything names ("<name> has stock or history. Make it
 * inactive instead."): the refusal shows here and the Delete button goes away, so only
 * Close is left.
 */
export function BinDeleteDialog({
    bin,
    actions,
    refusal,
    onClose,
    onDeleted,
}: BinDeleteDialogProps) {
    if (!bin) return null
    const confirm = refusal === null ? DELETE_CONFIRM : null
    const closeLabel = refusal === null ? 'Cancel' : 'Close'
    const run = () => actions.deleteRecord(bin.id, onDeleted)
    return (
        <DeleteRecordDialog
            testIdPrefix="bin-delete"
            title="Delete bin location"
            lines={linesOf(bin.name, refusal)}
            confirm={confirm}
            closeLabel={closeLabel}
            isWorking={actions.isWorking}
            onClose={onClose}
            onConfirm={run}
        />
    )
}
