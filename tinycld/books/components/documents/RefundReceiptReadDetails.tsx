import { accountLabel } from '../../lib/account-options'
import { paymentText } from '../../lib/deposit-accounts'
import { DocumentPaymentRow } from './DocumentPaymentRow'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// A refund has no details of its own beside the shared date (labelled "Refund date" by its
// host): its payment is the band's ruled row below (RefundReceiptBandRows).
export function RefundReceiptReadDetails({ children }: DocumentReadDetailsProps) {
    return children
}

// The band's last row, ruled off as the form's Payment row: "Check · 20417 · refunded from
// 1000 Business Checking", missing parts left out. A record of another kind has none.
export function RefundReceiptBandRows({ record }: DocumentReadBandRowProps) {
    const fields = record.kindFields
    if (fields.kind !== 'refund_receipt') return null
    const refundFrom = fields.refundFromRow
    const text = paymentText({
        method: fields.payment_method,
        reference: fields.reference_no,
        depositLabel: refundFrom ? accountLabel(refundFrom) : '',
        verb: 'refunded from',
    })
    return <DocumentPaymentRow testID="refund-receipt-detail-payment" text={text} />
}
