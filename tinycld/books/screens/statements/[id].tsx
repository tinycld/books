import { useLocalSearchParams } from 'expo-router'
import {
    StatementRouteLoadError,
    StatementScreen,
} from '../../components/statements/StatementScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `books/statements/<number>` (or `<id>`, lib/record-key.ts): one statement, pushed over the
// screen it was opened from.
export default function StatementRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_statements', key)
    if (route.isError) return <StatementRouteLoadError onRetry={route.retry} />
    if (route.id === undefined) return null
    return <StatementScreen key={route.id} id={route.id} />
}
