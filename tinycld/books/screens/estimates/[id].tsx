import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { ESTIMATE_DOCUMENT } from '../../components/documents/document-kinds'

// `tab=pdf` opens the PDF view tab.
export default function EstimateRoute() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
    return <DocumentScreen key={id} document={ESTIMATE_DOCUMENT} id={id} tab={tab} />
}
