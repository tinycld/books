import { useLocalSearchParams } from 'expo-router'
import { BillPaymentReadScreen } from '../../components/pay-bills/BillPaymentReadView'

// A bill payment only reads (there is no draft); Edit opens Pay Bills on `?replaces`.
export default function BillPaymentRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <BillPaymentReadScreen key={id} id={id} />
}
