import { useLocalSearchParams } from 'expo-router'
import { DocumentRouteLoadError } from '../../components/documents/DocumentLoadError'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { PURCHASE_ORDER_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A saved order opens in the read view; `edit=1` asks for its form (purchase order spec
// §3.2), which a writer gets on an open order. `tab=pdf` opens the PDF view tab. A failed
// read of the order's number shows the load error with Retry (spec §3.12).
export default function PurchaseOrderRoute() {
    const {
        id: key,
        tab,
        edit,
    } = useLocalSearchParams<{
        id: string
        tab?: string
        edit?: string
    }>()
    const route = useDocumentRouteId('books_purchase_orders', key)
    const isEdit = edit === '1'
    if (route.isError) {
        return <DocumentRouteLoadError document={PURCHASE_ORDER_DOCUMENT} onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return (
        <DocumentScreen
            key={route.id}
            document={PURCHASE_ORDER_DOCUMENT}
            id={route.id}
            tab={tab}
            isEdit={isEdit}
        />
    )
}
