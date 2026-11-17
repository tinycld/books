import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { CREDIT_MEMO_DOCUMENT } from '../../components/documents/document-kinds'

// `tab=pdf` opens the PDF view tab.
export default function CreditMemoRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <DocumentScreen key={id} document={CREDIT_MEMO_DOCUMENT} id={id} tab={tab} />
}
