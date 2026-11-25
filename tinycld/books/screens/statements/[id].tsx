import { useLocalSearchParams } from 'expo-router'
import { StatementScreen } from '../../components/statements/StatementScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// `books/statements/<number>` (or `<id>`, lib/record-key.ts): one statement, pushed over the
// screen it was opened from.
export default function StatementRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_statements', key)
    if (id === undefined) return null
    return <StatementScreen key={id} id={id} />
}
