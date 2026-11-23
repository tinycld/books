import { useLocalSearchParams } from 'expo-router'
import { InvoicePublicScreen } from '../../components/invoice-public/InvoicePublicScreen'

// /p/books/invoices/<token>: the customer's invoice page, signed out.
export default function PublicInvoiceRoute() {
    const { token } = useLocalSearchParams<{ token: string }>()
    const value = typeof token === 'string' ? token : ''
    return <InvoicePublicScreen token={value} />
}
