import { useLocalSearchParams } from 'expo-router'
import { PaymentScreen } from '../../components/payments/PaymentScreen'

// A draft opens in the form; a posted or void payment in the read view.
export default function PaymentRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <PaymentScreen key={id} id={id} />
}
