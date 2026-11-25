import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { INVOICE_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `tab=pdf` opens the PDF view tab.
export default function InvoiceRoute() {
    const { id: key, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    const id = useDocumentRouteId('books_invoices', key)
    if (id === undefined) return null
    return <DocumentScreen key={id} document={INVOICE_DOCUMENT} id={id} tab={tab} />
}
