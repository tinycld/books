import { useLocalSearchParams } from 'expo-router'
import { CreateStatementsScreen } from '../../components/statements/CreateStatementsScreen'

// `books/statements/new`, and `?customer=<id>` from a customer's New transaction menu.
export default function NewStatementsScreen() {
    const { customer } = useLocalSearchParams<{ customer?: string }>()
    const only = customer === '' ? undefined : customer
    return <CreateStatementsScreen customer={only} />
}
