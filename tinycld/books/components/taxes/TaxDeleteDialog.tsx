import type { TaxActions } from '../../hooks/useTaxActions'
import { deleteDialogCopy, type TaxDeleteTarget } from '../../lib/tax-menu'
import { useTaxesStore } from '../../stores/taxes-store'
import { type DeleteDialogLine, DeleteRecordDialog } from '../DeleteRecordDialog'

interface TaxDeleteDialogProps {
    target: TaxDeleteTarget
    id: string
    name: string
    // The page's one actions instance, so the dialog and the banner read one refusal.
    actions: TaxActions
}

function refusalLines(actions: TaxActions, id: string): DeleteDialogLine[] {
    const refusal = actions.refusal
    if (refusal?.id !== id) return []
    return [{ key: 'refusal', text: refusal.message, tone: 'error' }]
}

// Closing keeps a refusal: the page's banner shows it once the dialog is gone.
export function TaxDeleteDialog({ target, id, name, actions }: TaxDeleteDialogProps) {
    const closeDialog = useTaxesStore(s => s.closeDialog)
    const copy = deleteDialogCopy(target, name)
    const lines = [...copy.lines, ...refusalLines(actions, id)]
    // A group is a books_tax_rates row, so the rates' actions delete it.
    const kind = target === 'agency' ? actions.agencies : actions.rates
    const confirm = { testID: 'tax-delete-confirm', label: copy.confirmLabel, isDestructive: true }
    return (
        <DeleteRecordDialog
            testIdPrefix="tax-delete"
            title={copy.title}
            lines={lines}
            confirm={confirm}
            closeLabel="Cancel"
            isWorking={actions.isWorking}
            onClose={closeDialog}
            onConfirm={() => kind.deleteRecord(id)}
        />
    )
}
