import { useLocalSearchParams } from 'expo-router'
import { VendorRefundScreen } from '../../components/vendor-refunds/VendorRefundScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A draft opens in the form; a posted or void refund in the read view.
export default function VendorRefundRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_vendor_refunds', key)
    if (id === undefined) return null
    return <VendorRefundScreen key={id} id={id} />
}
