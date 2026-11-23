import { ReconcileHistoryView } from '../../components/reconcile/ReconcileHistoryView'
import { useReconcileHistory } from '../../hooks/useReconcileHistory'

export default function ReconcileHistoryScreen() {
    return <ReconcileHistoryView {...useReconcileHistory()} />
}
