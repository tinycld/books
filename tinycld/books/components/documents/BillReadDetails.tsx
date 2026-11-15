import { paymentTermLabel } from '../../lib/payment-terms'
import { formatDay } from '../../lib/register-range'
import { DocumentDetail } from './DocumentDetail'
import type { DocumentReadDetailsProps } from './document-kinds'

// The bill's own read details: Terms before the shared date (Bill date), Due date and
// Vendor's bill no. after it. A record of another kind has none of them, so only the
// shared date shows. A detail with no value is not drawn (a bill with no terms or no
// vendor's bill no.).
export function BillReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'bill') return children
    const { terms, due_date, ref_no } = fields
    const termsText = terms ? paymentTermLabel(terms) : ''
    const due = due_date ? `Due ${formatDay(due_date)}` : ''
    return (
        <>
            <DocumentDetail field="terms" label="Terms" value={termsText} />
            {children}
            <DocumentDetail field="due" label="Due date" value={due} />
            <DocumentDetail field="ref-no" label="Vendor's bill no." value={ref_no} />
        </>
    )
}
