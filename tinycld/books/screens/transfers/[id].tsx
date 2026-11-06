import { useLocalSearchParams } from 'expo-router'
import { TransferScreen } from '../../components/transfers/TransferScreen'

export default function TransferRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <TransferScreen key={id} entryId={id} />
}
