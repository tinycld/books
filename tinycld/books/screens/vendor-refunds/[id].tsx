import { useLocalSearchParams } from 'expo-router'
import { PaymentStateNotice } from '../../components/payments/PaymentStateNotice'
import { VendorRefundScreen } from '../../components/vendor-refunds/VendorRefundScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'

// A draft opens in the form; a posted or void refund in the read view. A failed read of its
// number shows the screen's load error with Retry.
export default function VendorRefundRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_vendor_refunds', key)
    if (route.isError) {
        return <PaymentStateNotice flow={VENDOR_REFUND_FLOW} state="error" onRetry={route.retry} />
    }
    if (route.id === undefined) return null
    return <VendorRefundScreen key={route.id} id={route.id} />
}
