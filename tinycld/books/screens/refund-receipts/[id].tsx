import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { REFUND_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'

// `tab=pdf` opens the PDF view tab.
export default function RefundReceiptRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <DocumentScreen key={id} document={REFUND_RECEIPT_DOCUMENT} id={id} tab={tab} />
}
