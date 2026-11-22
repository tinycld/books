import { useLocalSearchParams } from 'expo-router'
import { ReconcileScreenView } from '../../components/reconcile/ReconcileScreenView'
import { useReconcileScreen } from '../../hooks/useReconcileScreen'

function ReconcileScreen({ id }: { id: string }) {
    return <ReconcileScreenView {...useReconcileScreen(id)} />
}

// Keyed by the id, so another reconciliation starts from fresh queries and state.
export default function ReconcileRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <ReconcileScreen key={id} id={id} />
}
