import { useLocalSearchParams } from 'expo-router'
import { DepositScreen } from '../../components/deposits/DepositScreen'
import { DepositStateNotice } from '../../components/deposits/DepositStateNotice'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A posted or void deposit opens in the read view. A failed read of its number shows the
// screen's load error with Retry.
export default function DepositRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_deposits', key)
    if (route.isError) return <DepositStateNotice kind="error" onRetry={route.retry} />
    if (route.id === undefined) return null
    return <DepositScreen key={route.id} id={route.id} />
}
