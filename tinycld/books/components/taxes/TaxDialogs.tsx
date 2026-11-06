import { type TaxDialog, useTaxesStore } from '../../stores/taxes-store'
import { AgencyDialog } from './AgencyDialog'
import { RateDialog } from './RateDialog'

// A new key per dialog, so each open starts a fresh form.
function dialogKey(dialog: TaxDialog) {
    if (dialog.kind === 'delete') return `delete-${dialog.target}-${dialog.id}`
    if (dialog.kind === 'rate') return `rate-${dialog.id ?? 'new'}-${dialog.agencyId}`
    return `${dialog.kind}-${dialog.id ?? 'new'}`
}

// The one dialog the Sales tax page has open, from the page's store.
export function TaxDialogs() {
    const dialog = useTaxesStore(s => s.dialog)
    if (!dialog) return null
    const key = dialogKey(dialog)
    if (dialog.kind === 'agency') return <AgencyDialog key={key} id={dialog.id} />
    if (dialog.kind === 'rate') {
        return <RateDialog key={key} id={dialog.id} agencyId={dialog.agencyId} />
    }
    return null
}
