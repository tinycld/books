import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { REFUND_RECEIPT_DOCUMENT } from '../../components/documents/document-kinds'

// `customer` prefills the customer; `fresh` is a new key for each New refund receipt, so a
// second new form mounts blank. `replaces` edits a posted refund receipt, `copy` starts
// from one. `sales_receipt` starts a refund of a posted sales receipt (Refund),
// `credit_memo` a payout of a posted credit memo (Refund credit); with `credit_memo` the
// customer and the sales receipt are ignored (spec §3.3). `tab=pdf` opens the PDF view tab.
export default function NewRefundReceiptRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
        sales_receipt?: string
        credit_memo?: string
        tab?: string
    }>()
    const creditMemo = params.credit_memo || undefined
    const isPayout = creditMemo !== undefined
    const salesReceipt = isPayout ? undefined : params.sales_receipt
    const customer = isPayout ? undefined : params.customer
    return (
        <DocumentScreen
            document={REFUND_RECEIPT_DOCUMENT}
            id={null}
            customer={customer}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
            salesReceipt={salesReceipt}
            creditMemo={creditMemo}
            tab={params.tab}
        />
    )
}
