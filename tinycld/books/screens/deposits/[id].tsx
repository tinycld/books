import { useLocalSearchParams } from 'expo-router'
import { DepositScreen } from '../../components/deposits/DepositScreen'

// A posted or void deposit opens in the read view.
export default function DepositRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <DepositScreen key={id} id={id ?? ''} />
}
