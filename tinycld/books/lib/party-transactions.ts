// One customer's sales documents as one list (spec §3.5): invoices, estimates, sales
// receipts and payments mapped to one row shape with their status badge, merged newest
// first. Pure, so each rule is unit-tested; the hook (hooks/useCustomerTransactions.ts)
// feeds it.

import type { BooksEstimates, BooksInvoices, BooksPayments, BooksSalesReceipts } from '../types'
import type { StatusTone } from './document-lifecycle'
import { statusBadgeOf } from './document-lifecycle'
import { estimateStatusLabel, isExpired } from './estimate-status'
import { formatMoney } from './money'
import {
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from './sales-document-kinds'

export type TransactionKind = 'invoice' | 'estimate' | 'sales_receipt' | 'payment'

export type TransactionFilter = 'all' | TransactionKind

export interface PartyTransactionRow {
    id: string
    kind: TransactionKind
    number: string
    date: string
    // Invoices only; '' for the other kinds.
    dueDate: string
    total: number
    currency: string
    created: string
    status: { label: string; tone: StatusTone }
}

// The first window of rows, and the step it grows by near the end of the list.
export const TRANSACTION_PAGE = 50

export const TRANSACTION_TYPE_LABELS: Record<TransactionKind, string> = {
    invoice: 'Invoice',
    estimate: 'Estimate',
    sales_receipt: 'Sales receipt',
    payment: 'Payment',
}

// The chips, in strip order.
export const TRANSACTION_FILTERS: readonly { key: TransactionFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'estimate', label: 'Estimates' },
    { key: 'sales_receipt', label: 'Sales receipts' },
    { key: 'payment', label: 'Payments' },
]

// The route of each kind, for `documentHref`. A payment is not a sales-document kind
// (receive-payment spec §2), so it gives only its route.
export const TRANSACTION_DOC_KINDS: Record<
    TransactionKind,
    Pick<SalesDocumentKind, 'routeBase'>
> = {
    invoice: INVOICE_KIND,
    estimate: ESTIMATE_KIND,
    sales_receipt: SALES_RECEIPT_KIND,
    payment: { routeBase: 'books/payments' },
}

type InvoiceInput = Pick<
    BooksInvoices,
    'id' | 'status' | 'number' | 'date' | 'due_date' | 'total' | 'balance' | 'currency' | 'created'
>
type EstimateInput = Pick<
    BooksEstimates,
    'id' | 'status' | 'number' | 'date' | 'expiration_date' | 'total' | 'currency' | 'created'
>
type SalesReceiptInput = Pick<
    BooksSalesReceipts,
    'id' | 'status' | 'number' | 'date' | 'total' | 'currency' | 'created'
>
type PaymentInput = Pick<
    BooksPayments,
    'id' | 'status' | 'number' | 'date' | 'amount' | 'credited' | 'currency' | 'created'
>

const DRAFT = { label: 'Draft', tone: 'muted' } as const
const VOID = { label: 'Void', tone: 'muted' } as const

// Draft and Void are muted. A posted invoice's status follows its open balance
// (receive-payment spec §3.9), the first rule that applies winning: Paid when nothing is
// open, Partly paid while part of the total is open, Overdue when due before today, else
// Open. Days are YYYY-MM-DD text, so they compare as strings.
function invoiceStatus(row: InvoiceInput, today: string): PartyTransactionRow['status'] {
    if (row.status === 'draft') return { ...DRAFT }
    if (row.status === 'void') return { ...VOID }
    if (row.balance <= 0) return { label: 'Paid', tone: 'success' }
    if (row.balance < row.total) return { label: 'Partly paid', tone: 'warning' }
    if (row.due_date !== '' && row.due_date < today)
        return { label: 'Overdue', tone: 'destructive' }
    return { label: 'Open', tone: 'warning' }
}

// Expired replaces a Pending or Accepted estimate's status once it is past its date, as the
// Estimates screens show it; otherwise the quote badge.
function estimateStatus(row: EstimateInput, today: string): PartyTransactionRow['status'] {
    if (isExpired(row, today)) return { label: 'Expired', tone: 'muted' }
    return (
        statusBadgeOf('quote', row.status) ?? {
            label: estimateStatusLabel(row.status),
            tone: 'muted',
        }
    )
}

function receiptStatus(row: SalesReceiptInput): PartyTransactionRow['status'] {
    if (row.status === 'draft') return { ...DRAFT }
    if (row.status === 'void') return { ...VOID }
    return { label: 'Paid', tone: 'success' }
}

// A posted payment reads Applied when nothing was kept as a credit, else Credit $x.
function paymentStatus(row: PaymentInput): PartyTransactionRow['status'] {
    if (row.status === 'draft') return { ...DRAFT }
    if (row.status === 'void') return { ...VOID }
    if (row.credited > 0) {
        return { label: `Credit ${formatMoney(row.credited, row.currency)}`, tone: 'warning' }
    }
    return { label: 'Applied', tone: 'success' }
}

export function invoiceRow(row: InvoiceInput, today: string): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'invoice',
        number: row.number,
        date: row.date,
        dueDate: row.due_date,
        total: row.total,
        currency: row.currency,
        created: row.created,
        status: invoiceStatus(row, today),
    }
}

export function estimateRow(row: EstimateInput, today: string): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'estimate',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: row.total,
        currency: row.currency,
        created: row.created,
        status: estimateStatus(row, today),
    }
}

export function salesReceiptRow(row: SalesReceiptInput): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'sales_receipt',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: row.total,
        currency: row.currency,
        created: row.created,
        status: receiptStatus(row),
    }
}

// A payment's amount received is its total.
export function paymentRow(row: PaymentInput): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'payment',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: row.amount,
        currency: row.currency,
        created: row.created,
        status: paymentStatus(row),
    }
}

// A void original that a correction replaced is left out: the correction carries its
// number. A plain void stays. The hook's query applies this rule in its `where`, before
// `.limit(n)`, so each window holds only listed rows; this function states it for the tests.
export function isListedTransaction(row: { status: string; replaced_by?: string }): boolean {
    return !(row.status === 'void' && (row.replaced_by ?? '') !== '')
}

// Newest first: date desc, then created desc.
function newestFirst(a: PartyTransactionRow, b: PartyTransactionRow): number {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.created !== b.created) return a.created < b.created ? 1 : -1
    return 0
}

// Each list is one source's first `n` rows in the same order, so the merged first `n` rows
// are exact. A list that reached `n` may have more behind it, so the window can grow.
export function mergeTransactions(
    lists: PartyTransactionRow[][],
    n: number
): { rows: PartyTransactionRow[]; hasMore: boolean } {
    const rows = lists.flat().sort(newestFirst).slice(0, n)
    const hasMore = lists.some(list => list.length >= n)
    return { rows, hasMore }
}

const EMPTY_NOUNS: Record<TransactionKind, string> = {
    invoice: 'invoices',
    estimate: 'estimates',
    sales_receipt: 'sales receipts',
    payment: 'payments',
}

export function emptyText(filter: TransactionFilter): string {
    if (filter === 'all') return 'No transactions for this customer yet'
    return `No ${EMPTY_NOUNS[filter]} for this customer`
}

export function filterTestId(filter: TransactionFilter): string {
    return `customer-transactions-filter-${filter.replace('_', '-')}`
}
