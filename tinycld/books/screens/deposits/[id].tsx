import { useLocalSearchParams } from 'expo-router'
import { DepositScreen } from '../../components/deposits/DepositScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A posted or void deposit opens in the read view.
export default function DepositRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_deposits', key)
    if (id === undefined) return null
    return <DepositScreen key={id} id={id} />
}
