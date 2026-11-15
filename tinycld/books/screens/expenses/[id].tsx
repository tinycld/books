import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { EXPENSE_DOCUMENT } from '../../components/documents/document-kinds'

export default function ExpenseRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <DocumentScreen key={id} document={EXPENSE_DOCUMENT} id={id} />
}
