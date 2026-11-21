import { useLocalSearchParams } from 'expo-router'
import { StatementScreen } from '../../components/statements/StatementScreen'

// `books/statements/<id>`: one statement, pushed over the screen it was opened from.
export default function StatementRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <StatementScreen key={id} id={id} />
}
