import { useLocalSearchParams } from 'expo-router'
import { DocumentRouteLoadError } from '../../components/documents/DocumentLoadError'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { BILL_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

export default function BillRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_bills', key)
    if (route.isError) {
        return <DocumentRouteLoadError document={BILL_DOCUMENT} onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return <DocumentScreen key={route.id} document={BILL_DOCUMENT} id={route.id} />
}
