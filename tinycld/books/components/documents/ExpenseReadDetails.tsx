import { accountLabel } from '../../lib/account-options'
import { paymentText } from '../../lib/deposit-accounts'
import { DocumentDetail } from './DocumentDetail'
import { DocumentPaymentRow } from './DocumentPaymentRow'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// The expense's own read details (spec §3.8): Paid from ("1000 Business Checking") before
// the shared date (Payment date). The band draws the Vendor ("No vendor" for none) itself.
// A record of another kind has no Paid from, so only the shared date shows.
export function ExpenseReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'expense') return children
    const paidFrom = fields.paidFromRow ? accountLabel(fields.paidFromRow) : ''
    return (
        <>
            <DocumentDetail field="paid-from" label="Paid from" value={paidFrom} />
            {children}
        </>
    )
}

// The band's last row, ruled off as the form's second band row: "Check · 1042", the
// method's label and the Ref no., an empty part left out. A record of another kind has
// none.
export function ExpensePaymentRow({ record }: DocumentReadBandRowProps) {
    const fields = record.kindFields
    if (fields.kind !== 'expense') return null
    const text = paymentText({
        method: fields.payment_method,
        reference: fields.reference_no,
        depositLabel: '',
        verb: 'paid from',
    })
    return <DocumentPaymentRow testID="expense-detail-payment" text={text} />
}
