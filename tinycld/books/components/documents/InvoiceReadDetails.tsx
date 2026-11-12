import { paymentTermLabel } from '../../lib/payment-terms'
import { formatDay } from '../../lib/register-range'
import { DocumentDetail } from './DocumentDetail'
import type { DocumentReadDetailsProps } from './document-kinds'

// The invoice's own read details: Terms before the shared date, Due date after it. A
// record of another kind has none of them, so only the shared date shows.
export function InvoiceReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'invoice') return children
    const { terms, due_date } = fields
    const termsText = terms ? paymentTermLabel(terms) : ''
    const due = due_date ? `Due ${formatDay(due_date)}` : ''
    return (
        <>
            <DocumentDetail field="terms" label="Terms" value={termsText} />
            {children}
            <DocumentDetail field="due" label="Due date" value={due} />
        </>
    )
}
