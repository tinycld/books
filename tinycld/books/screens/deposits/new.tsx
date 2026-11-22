import { useLocalSearchParams } from 'expo-router'
import { DepositScreen } from '../../components/deposits/DepositScreen'

// A new deposit; `replaces` corrects a posted deposit. `fresh` is a new key for each Post
// & new, so the next form mounts blank (and Deposit to takes the focus again); the key
// also follows `replaces`.
export default function NewDepositRoute() {
    const params = useLocalSearchParams<{ replaces?: string; fresh?: string }>()
    const key = [params.fresh, params.replaces].join('|')
    return <DepositScreen key={key} id={null} replaces={params.replaces} />
}
