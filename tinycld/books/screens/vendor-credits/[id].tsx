import { useLocalSearchParams } from 'expo-router'
import { DocumentRouteLoadError } from '../../components/documents/DocumentLoadError'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { VENDOR_CREDIT_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

export default function VendorCreditRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_vendor_credits', key)
    if (route.isError) {
        return <DocumentRouteLoadError document={VENDOR_CREDIT_DOCUMENT} onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return <DocumentScreen key={route.id} document={VENDOR_CREDIT_DOCUMENT} id={route.id} />
}
