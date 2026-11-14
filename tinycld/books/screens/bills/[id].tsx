import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { BILL_DOCUMENT } from '../../components/documents/document-kinds'

export default function BillRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <DocumentScreen key={id} document={BILL_DOCUMENT} id={id} />
}
