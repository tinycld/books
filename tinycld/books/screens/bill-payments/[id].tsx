import { useLocalSearchParams } from 'expo-router'
import { BillPaymentReadScreen } from '../../components/pay-bills/BillPaymentReadView'
import { BillPaymentStateNotice } from '../../components/pay-bills/BillPaymentStateNotice'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A bill payment only reads (there is no draft); Edit opens Pay Bills on `?replaces`. A
// failed read of its number shows the screen's load error with Retry.
export default function BillPaymentRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_bill_payments', key)
    if (route.isError) return <BillPaymentStateNotice state="error" onRetry={route.retry} />
    if (route.id === undefined) return null
    return <BillPaymentReadScreen key={route.id} id={route.id} />
}
