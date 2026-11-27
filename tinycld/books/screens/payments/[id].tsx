import { useLocalSearchParams } from 'expo-router'
import { PaymentScreen } from '../../components/payments/PaymentScreen'
import { PaymentStateNotice } from '../../components/payments/PaymentStateNotice'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'
import { PAYMENT_FLOW } from '../../lib/payment-flow'

// A draft opens in the form; a posted or void payment in the read view. A failed read of its
// number shows the screen's load error with Retry.
export default function PaymentRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_payments', key)
    if (route.isError) {
        return <PaymentStateNotice flow={PAYMENT_FLOW} state="error" onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return <PaymentScreen key={route.id} id={route.id} />
}
