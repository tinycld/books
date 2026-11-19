import { useInvoiceCreditMemos } from '../../hooks/useInvoiceCreditMemos'
import { creditMemoStatus } from '../../lib/party-transactions'
import { CREDIT_MEMO_KIND } from '../../lib/sales-document-kinds'
import type { DocumentReadBandRowProps } from './document-kinds'
import {
    type LinkedDocumentRow,
    type LinkedDocumentsIds,
    LinkedDocumentsSection,
    linkedNumberOf,
} from './LinkedDocumentsSection'

const IDS: LinkedDocumentsIds = {
    section: 'invoice-credit-memos',
    table: 'invoice-credit-memos-table',
    cards: 'invoice-credit-memos-cards',
    error: 'invoice-credit-memos-error',
    retry: 'invoice-credit-memos-retry',
    row: id => `invoice-credit-memo-${id}`,
    link: id => `invoice-credit-memos-open-${id}`,
}

const ERROR_TEXT = 'Books could not load the credit memos of this invoice.'

/**
 * The invoice read view's "Credit memos" section (spec §3.10, the kind's ReadSection),
 * after the Payments block: the credit memos that name the invoice and are not a replaced
 * original, each with its number (a link; "Draft" for a draft), date, amount and status
 * (LinkedDocumentsSection). Nothing while the read loads. The invoice's Balance due does not
 * change (Q1).
 */
export function InvoiceCreditMemos({ record }: DocumentReadBandRowProps) {
    const memos = useInvoiceCreditMemos(record.id)
    const loaded = memos.isReady ? memos.rows : []
    const rows: LinkedDocumentRow[] = loaded.map(row => ({
        id: row.id,
        number: linkedNumberOf(row),
        date: row.date,
        amount: row.total,
        currency: row.currency,
        status: creditMemoStatus(row),
    }))
    const error = { isError: memos.isError, message: ERROR_TEXT, onRetry: memos.retry }
    return (
        <LinkedDocumentsSection
            ids={IDS}
            title="Credit memos"
            rows={rows}
            kind={CREDIT_MEMO_KIND}
            currency={record.currency}
            error={error}
        />
    )
}
