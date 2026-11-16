import { useLocalSearchParams } from 'expo-router'
import { PaymentScreen } from '../../components/payments/PaymentScreen'

// `customer` starts the form for that customer, `invoice` (with `customer`) ticks that
// invoice, `replaces` corrects a posted payment. `fresh` is a new key for each Post & new,
// so the next form mounts blank; the key also follows the other params.
export default function NewPaymentRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        invoice?: string
        replaces?: string
        fresh?: string
    }>()
    const key = [params.fresh, params.customer, params.invoice, params.replaces].join('|')
    return (
        <PaymentScreen
            key={key}
            id={null}
            customer={params.customer}
            invoice={params.invoice}
            replaces={params.replaces}
        />
    )
}
