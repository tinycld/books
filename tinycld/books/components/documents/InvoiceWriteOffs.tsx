import { useInvoiceWriteOffs } from '../../hooks/useInvoiceWriteOffs'
import { lifecycleStatus } from '../../lib/party-transactions'
import { WRITE_OFF_TEXTS } from '../../lib/write-off-fixture'
import type { DocumentReadBandRowProps } from './document-kinds'
import {
    type LinkedDocumentRow,
    type LinkedDocumentsIds,
    LinkedDocumentsSection,
} from './LinkedDocumentsSection'

const IDS: LinkedDocumentsIds = {
    section: 'invoice-write-offs',
    table: 'invoice-write-offs-table',
    cards: 'invoice-write-offs-cards',
    error: 'invoice-write-offs-error',
    retry: 'invoice-write-offs-retry',
    row: id => `invoice-write-off-${id}`,
    link: id => `invoice-write-offs-open-${id}`,
}

const WRITE_OFF_ROUTE = { routeBase: 'books/write-offs' }
const POSTED = { label: 'Posted', tone: 'success' } as const

/**
 * The invoice read view's "Write-offs" section (write-off spec §3.4), under its Credit
 * memos: each write-off that names the invoice, with its number (a link to
 * `books/write-offs/<id>`), date, amount and status (Posted / Void), through
 * LinkedDocumentsSection (a grid at 428 px and wider, cards below). Nothing while the read
 * loads or when no write-off names the invoice; a failed read shows the section's notice
 * with Retry.
 */
export function InvoiceWriteOffs({ record }: DocumentReadBandRowProps) {
    const writeOffs = useInvoiceWriteOffs(record.id)
    const loaded = writeOffs.isReady ? writeOffs.rows : []
    const rows: LinkedDocumentRow[] = loaded.map(row => ({
        id: row.id,
        number: row.number,
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        status: lifecycleStatus(row.status, POSTED),
    }))
    const error = {
        isError: writeOffs.isError,
        message: WRITE_OFF_TEXTS.sectionLoadFailed,
        onRetry: writeOffs.retry,
    }
    return (
        <LinkedDocumentsSection
            ids={IDS}
            title="Write-offs"
            rows={rows}
            kind={WRITE_OFF_ROUTE}
            currency={record.currency}
            error={error}
        />
    )
}
