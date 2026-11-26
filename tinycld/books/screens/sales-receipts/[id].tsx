import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { SALES_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `tab=pdf` opens the PDF view tab.
export default function SalesReceiptRoute() {
    const { id: key, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    const id = useDocumentRouteId('books_sales_receipts', key)
    if (id === undefined) return null
    return <DocumentScreen key={id} document={SALES_RECEIPT_DOCUMENT} id={id} tab={tab} />
}
