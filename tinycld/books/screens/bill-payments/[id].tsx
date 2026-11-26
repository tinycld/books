import { useLocalSearchParams } from 'expo-router'
import { BillPaymentReadScreen } from '../../components/pay-bills/BillPaymentReadView'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A bill payment only reads (there is no draft); Edit opens Pay Bills on `?replaces`.
export default function BillPaymentRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_bill_payments', key)
    if (id === undefined) return null
    return <BillPaymentReadScreen key={id} id={id} />
}
