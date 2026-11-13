import { Text, View } from 'react-native'
import { type DocumentStatus, statusBadgeOf } from '../../lib/document-lifecycle'
import { formatDay } from '../../lib/register-range'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import type { BooksInvoices } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { DocumentDetail } from './DocumentDetail'
import { DocumentSourceLink } from './DocumentSourceLink'
import { useDocumentKind } from './document-kind-context'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// The status as a badge under its label, as the title draws it.
function StatusDetail({ status }: { status: DocumentStatus }) {
    const { doc } = useDocumentKind()
    const badge = statusBadgeOf(doc.lifecycle, status)
    if (!badge) return null
    const testID = `${doc.testId}-detail-status`
    return (
        <View testID={testID} className="items-start gap-0.5">
            <Text className="text-xs text-muted-foreground">Status</Text>
            <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
    )
}

type InvoiceRow = Pick<BooksInvoices, 'number' | 'status'> | undefined

// What a closed estimate's invoice line says: a draft invoice has no number yet.
function convertedText(status: DocumentStatus, invoice: InvoiceRow): string {
    if (status !== 'closed' || !invoice) return ''
    if (invoice.status === 'draft') return 'Converted to a draft invoice'
    return `Converted to invoice ${invoice.number}`
}

// The estimate's own read details (spec §3.8): the shared date (its host labels it
// "Estimate date"), Expiration date, the status, Accepted by and Accepted date when set.
// A record of another kind has none of them, so only the shared date shows.
export function EstimateReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'estimate') return children
    const expiration = fields.expiration_date ? formatDay(fields.expiration_date) : ''
    const acceptedDate = fields.accepted_date ? formatDay(fields.accepted_date) : ''
    return (
        <>
            {children}
            <DocumentDetail field="expiration" label="Expiration date" value={expiration} />
            <StatusDetail status={record.status} />
            <DocumentDetail field="accepted-by" label="Accepted by" value={fields.accepted_by} />
            <DocumentDetail field="accepted-date" label="Accepted date" value={acceptedDate} />
        </>
    )
}

// Under the message and memo of a closed estimate, where an invoice shows "From estimate
// <n>": "Converted to invoice 1004" (or "Converted to a draft invoice"), a link that
// opens the invoice, as Open invoice (I) does. The invoice is the record query's
// (`invoiceRow`), part of the screen's loading and Retry.
export function EstimateConvertedLink({ record }: DocumentReadBandRowProps) {
    const { doc } = useDocumentKind()
    const fields = record.kindFields
    if (fields.kind !== 'estimate' || !fields.invoice) return null
    const label = convertedText(record.status, fields.invoiceRow)
    if (label === '') return null
    const testID = `${doc.testId}-converted-to`
    return (
        <DocumentSourceLink label={label} kind={INVOICE_KIND} id={fields.invoice} testID={testID} />
    )
}
