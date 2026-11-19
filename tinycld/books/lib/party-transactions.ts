// One customer's sales documents as one list (spec §3.5): invoices, estimates, sales
// receipts, payments and credit memos mapped to one row shape with their status badge,
// merged newest first. Pure, so each rule is unit-tested; the hook
// (hooks/useCustomerTransactions.ts) feeds it.

import type {
    BooksCreditMemos,
    BooksEstimates,
    BooksInvoices,
    BooksPayments,
    BooksSalesReceipts,
} from '../types'
import type { StatusTone } from './document-lifecycle'
import { statusBadgeOf } from './document-lifecycle'
import { estimateStatusLabel, isExpired } from './estimate-status'
import { formatMoney, MINUS } from './money'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from './sales-document-kinds'

export type TransactionKind = 'invoice' | 'estimate' | 'sales_receipt' | 'payment' | 'credit_memo'

export type TransactionFilter = 'all' | TransactionKind

export interface PartyTransactionRow {
    id: string
    kind: TransactionKind
    number: string
    date: string
    // Invoices only; '' for the other kinds.
    dueDate: string
    // A credit memo's total is its stored total negated: the credit lowers what is owed.
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
    credit_memo: 'Credit memo',
}

// The chips, in strip order.
export const TRANSACTION_FILTERS: readonly { key: TransactionFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'estimate', label: 'Estimates' },
    { key: 'sales_receipt', label: 'Sales receipts' },
    { key: 'payment', label: 'Payments' },
    { key: 'credit_memo', label: 'Credit memos' },
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
    credit_memo: CREDIT_MEMO_KIND,
}

const TRANSACTION_KINDS: readonly TransactionKind[] = [
    'invoice',
    'estimate',
    'sales_receipt',
    'payment',
    'credit_memo',
]

// The inverse of TRANSACTION_DOC_KINDS: the transaction kind of a document kind, by its
// route; null for a kind no sales list holds (a bill, an expense).
export function transactionKindOf(
    doc: Pick<SalesDocumentKind, 'routeBase'>
): TransactionKind | null {
    return (
        TRANSACTION_KINDS.find(kind => TRANSACTION_DOC_KINDS[kind].routeBase === doc.routeBase) ??
        null
    )
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
type CreditMemoInput = Pick<
    BooksCreditMemos,
    'id' | 'status' | 'number' | 'date' | 'total' | 'balance' | 'currency' | 'created'
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

// A posted credit memo reads Unapplied while credit is left on it, else Applied (credit
// memo spec §3.10). The Transactions tab and the invoice's Credit memos section both use it.
export function creditMemoStatus(row: { status: string; balance: number }): {
    label: string
    tone: StatusTone
} {
    if (row.status === 'draft') return { ...DRAFT }
    if (row.status === 'void') return { ...VOID }
    if (row.balance > 0) return { label: 'Unapplied', tone: 'warning' }
    return { label: 'Applied', tone: 'success' }
}

// A posted refund receipt reads Refunded (refund receipt spec §3.11, §3.12). The sales
// receipt's and the credit memo's sections use it.
export function refundReceiptStatus(row: { status: string }): {
    label: string
    tone: StatusTone
} {
    if (row.status === 'draft') return { ...DRAFT }
    if (row.status === 'void') return { ...VOID }
    return { label: 'Refunded', tone: 'success' }
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

// A credit memo's total is stored positive; the row negates it, as the credit lowers what
// the customer owes. It has no due date.
export function creditMemoRow(row: CreditMemoInput): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'credit_memo',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: -row.total,
        currency: row.currency,
        created: row.created,
        status: creditMemoStatus(row),
    }
}

export function transactionTotalText(row: PartyTransactionRow, currency: string): string {
    if (row.total >= 0) return formatMoney(row.total, currency)
    return `${MINUS}${formatMoney(-row.total, currency)}`
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
// `compare` must be the order every list is in (the sales lists pass their sort's).
export function mergeTransactions<Row extends PartyTransactionRow>(
    lists: Row[][],
    n: number,
    compare: (a: Row, b: Row) => number = newestFirst
): { rows: Row[]; hasMore: boolean } {
    const rows = lists.flat().sort(compare).slice(0, n)
    const hasMore = lists.some(list => list.length >= n)
    return { rows, hasMore }
}

const EMPTY_NOUNS: Record<TransactionKind, string> = {
    invoice: 'invoices',
    estimate: 'estimates',
    sales_receipt: 'sales receipts',
    payment: 'payments',
    credit_memo: 'credit memos',
}

export function emptyText(filter: TransactionFilter): string {
    if (filter === 'all') return 'No transactions for this customer yet'
    return `No ${EMPTY_NOUNS[filter]} for this customer`
}

export function filterTestId(filter: TransactionFilter): string {
    return `customer-transactions-filter-${filter.replace('_', '-')}`
}
