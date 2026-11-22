import { ReconcileAccountsView } from '../../components/reconcile/ReconcileAccountsView'
import { useReconcileAccounts } from '../../hooks/useReconcileAccounts'

export default function ReconcileAccountsScreen() {
    return <ReconcileAccountsView {...useReconcileAccounts()} />
}
