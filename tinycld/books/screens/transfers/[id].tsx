import { useLocalSearchParams } from 'expo-router'
import { TransferScreen } from '../../components/transfers/TransferScreen'
import { useEntryRouteId } from '../../hooks/useRouteRecordId'

export default function TransferRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useEntryRouteId('transfer', key)
    if (id === undefined) return null
    return <TransferScreen key={id} entryId={id} />
}
