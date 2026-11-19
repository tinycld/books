import type { DocumentRecord } from '../../hooks/document-data'
import { accountLabel } from '../../lib/account-options'
import { paymentText } from '../../lib/deposit-accounts'
import { refundSourceLabel } from '../../lib/document-source-links'
import { CREDIT_MEMO_KIND, SALES_RECEIPT_KIND } from '../../lib/sales-document-kinds'
import { DocumentPaymentRow } from './DocumentPaymentRow'
import { DocumentSourceLink } from './DocumentSourceLink'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// A refund has no details of its own beside the shared date (labelled "Refund date" by its
// host): its source and its payment are the band's last rows (RefundReceiptBandRows).
export function RefundReceiptReadDetails({ children }: DocumentReadDetailsProps) {
    return children
}

// The stored link of a refund: "Refund of sales receipt 1004" or "Pays out credit memo
// 1001", with " (void)" once that source is void, which opens the source. Its number and
// status are the record query's (`salesReceiptRow`, `creditMemoRow`), so it waits on no
// query of its own; nothing shows for a refund with no link, or one whose source row the
// user cannot read.
function RefundSourceLink({ record }: { record: DocumentRecord }) {
    const fields = record.kindFields
    if (fields.kind !== 'refund_receipt') return null
    const testID = 'refund-receipt-source-link'
    if (fields.credit_memo !== '' && fields.creditMemoRow) {
        const label = refundSourceLabel({ key: 'credit_memo', ...fields.creditMemoRow })
        return (
            <DocumentSourceLink
                label={label}
                kind={CREDIT_MEMO_KIND}
                id={fields.credit_memo}
                testID={testID}
            />
        )
    }
    if (fields.sales_receipt === '' || !fields.salesReceiptRow) return null
    const label = refundSourceLabel({ key: 'sales_receipt', ...fields.salesReceiptRow })
    return (
        <DocumentSourceLink
            label={label}
            kind={SALES_RECEIPT_KIND}
            id={fields.sales_receipt}
            testID={testID}
        />
    )
}

// The band's last rows: the source link, then the Payment row ruled off as the form's,
// "Check · 20417 · refunded from 1000 Business Checking", missing parts left out. A record
// of another kind has none.
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
    return (
        <>
            <RefundSourceLink record={record} />
            <DocumentPaymentRow testID="refund-receipt-detail-payment" text={text} />
        </>
    )
}
