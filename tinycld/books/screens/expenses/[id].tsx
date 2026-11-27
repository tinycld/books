import { useLocalSearchParams } from 'expo-router'
import { DocumentRouteLoadError } from '../../components/documents/DocumentLoadError'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { EXPENSE_DOCUMENT } from '../../components/documents/document-kinds'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

export default function ExpenseRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_expenses', key)
    if (route.isError) {
        return <DocumentRouteLoadError document={EXPENSE_DOCUMENT} onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return <DocumentScreen key={route.id} document={EXPENSE_DOCUMENT} id={route.id} />
}
