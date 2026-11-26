import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { REFUND_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `tab=pdf` opens the PDF view tab.
export default function RefundReceiptRoute() {
    const { id: key, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    const id = useDocumentRouteId('books_refund_receipts', key)
    if (id === undefined) return null
    return <DocumentScreen key={id} document={REFUND_RECEIPT_DOCUMENT} id={id} tab={tab} />
}
