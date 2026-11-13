import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { SALES_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'

// `tab=pdf` opens the PDF view tab.
export default function SalesReceiptRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <DocumentScreen key={id} document={SALES_RECEIPT_DOCUMENT} id={id} tab={tab} />
}
