import { useLocalSearchParams } from 'expo-router'
import { DocumentRouteLoadError } from '../../components/documents/DocumentLoadError'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { SALES_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `tab=pdf` opens the PDF view tab.
export default function SalesReceiptRoute() {
    const { id: key, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    const route = useDocumentRouteId('books_sales_receipts', key)
    if (route.isError) {
        return <DocumentRouteLoadError document={SALES_RECEIPT_DOCUMENT} onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return (
        <DocumentScreen key={route.id} document={SALES_RECEIPT_DOCUMENT} id={route.id} tab={tab} />
    )
}
