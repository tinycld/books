import { accountLabel } from '../../lib/account-options'
import { paymentText } from '../../lib/deposit-accounts'
import { DocumentPaymentRow } from './DocumentPaymentRow'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// A receipt has no details of its own beside the shared date (labelled "Sale date" by its
// host): its payment is the band's ruled row below (SalesReceiptPaymentRow).
export function SalesReceiptReadDetails({ children }: DocumentReadDetailsProps) {
    return children
}

// The band's last row, ruled off as the form's Payment row: "Check · 43567 · deposited to
// 1010 Business Savings", missing parts left out. A record of another kind has none.
export function SalesReceiptPaymentRow({ record }: DocumentReadBandRowProps) {
    const fields = record.kindFields
    if (fields.kind !== 'sales_receipt') return null
    const deposit = fields.depositRow
    const depositLabel = deposit ? accountLabel(deposit) : ''
    const text = paymentText({
        method: fields.payment_method,
        reference: fields.reference_no,
        depositLabel,
        verb: 'deposited to',
    })
    return <DocumentPaymentRow testID="sales-receipt-detail-payment" text={text} />
}
