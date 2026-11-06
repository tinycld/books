import type { TaxActions } from '../../hooks/useTaxActions'
import { type TaxDialog, useTaxesStore } from '../../stores/taxes-store'
import { AgencyDialog } from './AgencyDialog'
import { GroupDialog } from './GroupDialog'
import { RateDialog } from './RateDialog'
import { TaxDeleteDialog } from './TaxDeleteDialog'

// A new key per dialog, so each open starts a fresh form.
function dialogKey(dialog: TaxDialog) {
    if (dialog.kind === 'delete') return `delete-${dialog.target}-${dialog.id}`
    if (dialog.kind === 'rate') return `rate-${dialog.id ?? 'new'}-${dialog.agencyId}`
    return `${dialog.kind}-${dialog.id ?? 'new'}`
}

// The one dialog the Sales tax page has open, from the page's store. The delete confirm
// takes the page's actions, whose refusal the page's banner also reads.
export function TaxDialogs({ actions }: { actions: TaxActions }) {
    const dialog = useTaxesStore(s => s.dialog)
    if (!dialog) return null
    const key = dialogKey(dialog)
    if (dialog.kind === 'agency') return <AgencyDialog key={key} id={dialog.id} />
    if (dialog.kind === 'rate') {
        return <RateDialog key={key} id={dialog.id} agencyId={dialog.agencyId} />
    }
    if (dialog.kind === 'group') return <GroupDialog key={key} id={dialog.id} />
    return (
        <TaxDeleteDialog
            key={key}
            target={dialog.target}
            id={dialog.id}
            name={dialog.name}
            actions={actions}
        />
    )
}
