import { useLocalSearchParams } from 'expo-router'
import { InvoiceScreen } from '../../components/invoices/InvoiceScreen'

// `customer` prefills the customer; `fresh` is a new key for each New invoice, so a
// second new form mounts blank. `replaces` and `copy` are read by later checkpoints.
export default function NewInvoiceRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
    }>()
    return (
        <InvoiceScreen
            id={null}
            customer={params.customer}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
        />
    )
}
