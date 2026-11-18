import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { VENDOR_CREDIT_DOCUMENT } from '../../components/documents/document-kinds'

export default function VendorCreditRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <DocumentScreen key={id} document={VENDOR_CREDIT_DOCUMENT} id={id} />
}
