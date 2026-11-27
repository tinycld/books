import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { PURCHASE_ORDER_DOCUMENT } from '../../components/documents/document-kinds'

// `vendor` prefills the vendor; `fresh` is a new key for each New purchase order, so a second
// new form mounts blank. `copy` starts from an order (Copy on its read view). `tab=pdf` opens
// the PDF view tab. An order has no correction, so there is no `replaces`.
export default function NewPurchaseOrderRoute() {
    const params = useLocalSearchParams<{
        vendor?: string
        fresh?: string
        copy?: string
        tab?: string
    }>()
    return (
        <DocumentScreen
            document={PURCHASE_ORDER_DOCUMENT}
            id={null}
            vendor={params.vendor}
            fresh={params.fresh}
            copy={params.copy}
            tab={params.tab}
        />
    )
}
