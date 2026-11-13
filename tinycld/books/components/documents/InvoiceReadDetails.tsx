import { paymentTermLabel } from '../../lib/payment-terms'
import { formatDay } from '../../lib/register-range'
import { ESTIMATE_KIND } from '../../lib/sales-document-kinds'
import { DocumentDetail } from './DocumentDetail'
import { DocumentSourceLink } from './DocumentSourceLink'
import { useDocumentKind } from './document-kind-context'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

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

// Under the Posted-by stamp of an invoice made from an estimate: "From estimate <n>",
// which opens the estimate. Its number is the record query's (`estimateRow`), so the link
// waits on no query of its own; nothing shows for an invoice that names no estimate.
export function InvoiceFromEstimateLink({ record }: DocumentReadBandRowProps) {
    const { doc } = useDocumentKind()
    const fields = record.kindFields
    if (fields.kind !== 'invoice' || !fields.estimate || !fields.estimateRow) return null
    const label = `From estimate ${fields.estimateRow.number}`
    const testID = `${doc.testId}-from-estimate`
    return (
        <DocumentSourceLink
            label={label}
            kind={ESTIMATE_KIND}
            id={fields.estimate}
            testID={testID}
        />
    )
}
