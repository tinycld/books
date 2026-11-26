import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { VENDOR_CREDIT_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

export default function VendorCreditRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_vendor_credits', key)
    if (id === undefined) return null
    return <DocumentScreen key={id} document={VENDOR_CREDIT_DOCUMENT} id={id} />
}
