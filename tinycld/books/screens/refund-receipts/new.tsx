import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { REFUND_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'

// `customer` prefills the customer; `fresh` is a new key for each New refund receipt, so a
// second new form mounts blank. `replaces` edits a posted refund receipt, `copy` starts
// from one. `tab=pdf` opens the PDF view tab.
export default function NewRefundReceiptRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
        tab?: string
    }>()
    return (
        <DocumentScreen
            document={REFUND_RECEIPT_DOCUMENT}
            id={null}
            customer={params.customer}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
            tab={params.tab}
        />
    )
}
