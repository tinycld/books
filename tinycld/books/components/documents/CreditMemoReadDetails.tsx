import { invoiceLinkLabel } from '../../lib/credit-memo-link'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import { DocumentSourceLink } from './DocumentSourceLink'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// A credit memo has no Terms and no Due date: its only detail beside the band's shared
// ones is the shared date (labelled "Credit memo date" by its host). The invoice it is
// for is the band's last row (CreditMemoInvoiceLink).
export function CreditMemoReadDetails({ children }: DocumentReadDetailsProps) {
    return children
}

// The band's last row of a memo made for an invoice: "For invoice 1004", or "For invoice
// 1004 (void)" once that invoice is void, which opens the invoice. Its number and status
// are the record query's (`invoiceRow`), so the link waits on no query of its own; nothing
// shows for a memo with no invoice, or a record of another kind.
export function CreditMemoInvoiceLink({ record }: DocumentReadBandRowProps) {
    const fields = record.kindFields
    if (fields.kind !== 'credit_memo' || !fields.invoice || !fields.invoiceRow) return null
    const label = invoiceLinkLabel(fields.invoiceRow)
    return (
        <DocumentSourceLink
            label={label}
            kind={INVOICE_KIND}
            id={fields.invoice}
            testID="credit-memo-invoice-link"
        />
    )
}
