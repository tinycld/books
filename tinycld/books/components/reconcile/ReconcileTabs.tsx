import { useReconcileTabs } from '../../hooks/useReconcileTabs'
import { RECONCILE_TABS, type ReconcileTab } from '../../lib/reconcile-history'
import { ListTabs } from '../ListTabs'

/**
 * The tab row of Reconcile, Accounts · History; `useReconcileTabs` changes the route. Test
 * ids `reconcile-tab-accounts` and `reconcile-tab-history`.
 */
export function ReconcileTabs({ selected }: { selected: ReconcileTab }) {
    const { onSelect } = useReconcileTabs(selected)
    return (
        <ListTabs
            tabs={RECONCILE_TABS}
            selected={selected}
            testIdPrefix="reconcile"
            onSelect={onSelect}
        />
    )
}
