import { useLocalSearchParams } from 'expo-router'
import { PaymentScreen } from '../../components/payments/PaymentScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A draft opens in the form; a posted or void payment in the read view.
export default function PaymentRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_payments', key)
    if (id === undefined) return null
    return <PaymentScreen key={id} id={id} />
}
