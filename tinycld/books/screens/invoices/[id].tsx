import { useLocalSearchParams } from 'expo-router'
import { InvoiceScreen } from '../../components/invoices/InvoiceScreen'

// `tab=pdf` opens the PDF view tab.
export default function InvoiceRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <InvoiceScreen key={id} id={id} tab={tab} />
}
