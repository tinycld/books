import { useLocalSearchParams } from 'expo-router'
import { PayBillsScreen } from '../components/pay-bills/PayBillsScreen'

// `vendor` sets the Vendor filter, `bill` pays that bill and filters to its vendor,
// `replaces` names the bill payment a correction replaces. The key follows the params, so
// another set mounts a fresh screen.
export default function PayBillsRoute() {
    const params = useLocalSearchParams<{ vendor?: string; bill?: string; replaces?: string }>()
    const key = [params.vendor, params.bill, params.replaces].join('|')
    return (
        <PayBillsScreen
            key={key}
            vendor={params.vendor}
            bill={params.bill}
            replaces={params.replaces}
        />
    )
}
