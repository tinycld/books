import type { LinkedRefundReceipts } from '../../hooks/useLinkedRefundReceipts'
import { refundReceiptStatus } from '../../lib/party-transactions'
import { REFUND_RECEIPT_KIND } from '../../lib/sales-document-kinds'
import type { DocumentReadSectionProps } from './document-kinds'
import {
    type LinkedDocumentRow,
    type LinkedDocumentsIds,
    LinkedDocumentsSection,
    linkedNumberOf,
} from './LinkedDocumentsSection'

// `<prefix>`, `-table`, `-cards`, `-error`, `-retry`, `-row-<id>`, and each row's link
// `-open-<id>`.
function sectionIds(prefix: string): LinkedDocumentsIds {
    return {
        section: prefix,
        table: `${prefix}-table`,
        cards: `${prefix}-cards`,
        error: `${prefix}-error`,
        retry: `${prefix}-retry`,
        row: id => `${prefix}-row-${id}`,
        link: id => `${prefix}-open-${id}`,
    }
}

const SALES_RECEIPT_IDS = sectionIds('sales-receipt-refunds')
const CREDIT_MEMO_IDS = sectionIds('credit-memo-refunds')

// The read's rows as the section draws them: "Draft" for a draft's number, the total with no
// sign, and Draft / Refunded / Void.
function refundRowsOf(linked: LinkedRefundReceipts): LinkedDocumentRow[] {
    return linked.rows.map(row => ({
        id: row.id,
        number: linkedNumberOf(row),
        date: row.date,
        amount: row.total,
        currency: row.currency,
        status: refundReceiptStatus(row),
    }))
}

interface RefundsSectionProps extends DocumentReadSectionProps {
    ids: LinkedDocumentsIds
    title: string
    errorText: string
}

function RefundsSection({
    record,
    linkedRefunds,
    onRetry,
    ids,
    title,
    errorText,
}: RefundsSectionProps) {
    const rows = refundRowsOf(linkedRefunds)
    const error = { isError: linkedRefunds.isError, message: errorText, onRetry }
    return (
        <LinkedDocumentsSection
            ids={ids}
            title={title}
            rows={rows}
            kind={REFUND_RECEIPT_KIND}
            currency={record.currency}
            error={error}
        />
    )
}

/**
 * The sales receipt read view's "Refund receipts" section (refund receipt spec §3.11, the
 * kind's ReadSection): the refund receipts that name the receipt and are not a replaced
 * original, from the read view's one read (`DocumentKind.readLinkedRefunds`).
 */
export function SalesReceiptRefunds(props: DocumentReadSectionProps) {
    return (
        <RefundsSection
            {...props}
            ids={SALES_RECEIPT_IDS}
            title="Refund receipts"
            errorText="Books could not load the refund receipts of this sales receipt."
        />
    )
}

/**
 * The credit memo read view's "Refunds" section (refund receipt spec §3.12, the kind's
 * ReadSection): the refund receipts that pay the memo out, from the same read whose posted
 * rows give the totals' Refunded row.
 */
export function CreditMemoRefunds(props: DocumentReadSectionProps) {
    return (
        <RefundsSection
            {...props}
            ids={CREDIT_MEMO_IDS}
            title="Refunds"
            errorText="Books could not load the refunds of this credit memo."
        />
    )
}
