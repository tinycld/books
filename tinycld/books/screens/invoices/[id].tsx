import { useLocalSearchParams } from 'expo-router'
import { InvoiceScreen } from '../../components/invoices/InvoiceScreen'

export default function InvoiceRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <InvoiceScreen key={id} id={id} />
}
