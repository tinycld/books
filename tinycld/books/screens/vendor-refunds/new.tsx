import { useLocalSearchParams } from 'expo-router'
import { VendorRefundScreen } from '../../components/vendor-refunds/VendorRefundScreen'

// `vendor` starts the form for that vendor, `credit` (with `vendor`) ticks that credit,
// `replaces` corrects a posted refund. `fresh` is a new key for each Post & new, so the
// next form mounts blank; the key also follows the other params.
export default function NewVendorRefundRoute() {
    const params = useLocalSearchParams<{
        vendor?: string
        credit?: string
        replaces?: string
        fresh?: string
    }>()
    const key = [params.fresh, params.vendor, params.credit, params.replaces].join('|')
    return (
        <VendorRefundScreen
            key={key}
            id={null}
            vendor={params.vendor}
            credit={params.credit}
            replaces={params.replaces}
        />
    )
}
