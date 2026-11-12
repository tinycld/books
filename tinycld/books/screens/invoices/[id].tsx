import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { INVOICE_DOCUMENT } from '../../components/documents/document-kinds'

// `tab=pdf` opens the PDF view tab.
export default function InvoiceRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <DocumentScreen key={id} document={INVOICE_DOCUMENT} id={id} tab={tab} />
}
