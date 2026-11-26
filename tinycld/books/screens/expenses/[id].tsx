import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { EXPENSE_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

export default function ExpenseRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_expenses', key)
    if (id === undefined) return null
    return <DocumentScreen key={id} document={EXPENSE_DOCUMENT} id={id} />
}
