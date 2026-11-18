import { useLocalSearchParams } from 'expo-router'
import { VendorRefundScreen } from '../../components/vendor-refunds/VendorRefundScreen'

// A draft opens in the form; a posted or void refund in the read view.
export default function VendorRefundRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <VendorRefundScreen key={id} id={id} />
}
