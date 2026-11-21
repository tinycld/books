// One customer's sales documents as one list (spec §3.5): invoices, estimates, sales
// receipts, payments, credit memos, refund receipts and write-offs mapped to one row shape
// with their status badge, merged newest first. Pure, so each rule is unit-tested; the hook
// (hooks/useCustomerTransactions.ts) feeds it.

import type {
    BooksCreditMemos,
    BooksEstimates,
    BooksInvoices,
    BooksPayments,
    BooksRefundReceipts,
    BooksSalesReceipts,
    BooksWriteOffs,
} from '../types'
import type { StatusTone } from './document-lifecycle'
import { statusBadgeOf } from './document-lifecycle'
import { estimateStatusLabel, isExpired } from './estimate-status'
import { formatMoney, MINUS } from './money'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from './sales-document-kinds'

export type TransactionKind =
    | 'invoice'
    | 'estimate'
    | 'sales_receipt'
    | 'payment'
    | 'credit_memo'
    | 'refund_receipt'
    | 'write_off'

export type TransactionFilter = 'all' | TransactionKind

// One row of a party page's Transactions list. `Kind` is the party's kind union: the
// sales kinds for a customer (the default), the purchase kinds for a vendor.
export interface PartyTransactionRow<Kind extends string = TransactionKind> {
    id: string
    kind: Kind
    number: string
    date: string
    // Set by the kinds with a due date (invoice, bill); '' for every other kind.
    dueDate: string
    // A credit memo's, a refund receipt's and a write-off's total is its stored total
    // negated: the credit lowers what is owed, a refund is money paid back, and a write-off
    // lowers what is owed.
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
    refund_receipt: 'Refund receipt',
    write_off: 'Write-off',
}

// The chips, in strip order.
export const TRANSACTION_FILTERS: readonly { key: TransactionFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'estimate', label: 'Estimates' },
    { key: 'sales_receipt', label: 'Sales receipts' },
    { key: 'payment', label: 'Payments' },
    { key: 'credit_memo', label: 'Credit memos' },
    { key: 'refund_receipt', label: 'Refunds' },
    { key: 'write_off', label: 'Write-offs' },
]

// The route of each kind, for `documentHref`. A payment and a write-off are not
// sales-document kinds (receive-payment spec §2, write-off spec §2), so each gives only its
// route.
export const TRANSACTION_DOC_KINDS: Record<
    TransactionKind,
    Pick<SalesDocumentKind, 'routeBase'>
> = {
    invoice: INVOICE_KIND,
    estimate: ESTIMATE_KIND,
    sales_receipt: SALES_RECEIPT_KIND,
    payment: { routeBase: 'books/payments' },
    credit_memo: CREDIT_MEMO_KIND,
    refund_receipt: REFUND_RECEIPT_KIND,
    write_off: { routeBase: 'books/write-offs' },
}

const TRANSACTION_KINDS: readonly TransactionKind[] = [
    'invoice',
    'estimate',
    'sales_receipt',
    'payment',
    'credit_memo',
    'refund_receipt',
    'write_off',
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
    | 'id'
    | 'status'
    | 'number'
    | 'date'
    | 'due_date'
    | 'total'
    | 'balance'
    | 'written_off'
    | 'currency'
    | 'created'
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
    'id' | 'status' | 'number' | 'date' | 'total' | 'balance' | 'applied' | 'currency' | 'created'
>
type RefundReceiptInput = Pick<
    BooksRefundReceipts,
    'id' | 'status' | 'number' | 'date' | 'total' | 'currency' | 'created'
>
type WriteOffInput = Pick<
    BooksWriteOffs,
    'id' | 'status' | 'number' | 'date' | 'amount' | 'currency' | 'created'
>

type StatusBadge = PartyTransactionRow['status']

const DRAFT: StatusBadge = { label: 'Draft', tone: 'muted' }
const VOID: StatusBadge = { label: 'Void', tone: 'muted' }

// The one lifecycle rule of every party document kind, customer and vendor: a draft reads
// Draft and a void Void (both muted); a posted document shows `posted`, the kind's own badge.
export function lifecycleStatus(status: string, posted: StatusBadge): StatusBadge {
    if (status === 'draft') return { ...DRAFT }
    if (status === 'void') return { ...VOID }
    return { ...posted }
}

// A posted credit (credit memo, vendor credit) shows `open` while credit is left on it,
// else `closed`; the kinds name the closed badge differently.
export function creditStatus(
    row: { status: string; balance: number },
    badges: { open: StatusBadge; closed: StatusBadge }
): StatusBadge {
    return lifecycleStatus(row.status, row.balance > 0 ? badges.open : badges.closed)
}

// A posted invoice's or bill's status follows its open balance (receive-payment spec §3.9,
// vendor pages §3.5), the first rule that applies winning: Written off when nothing is open
// and a posted write-off closed it (`writtenOff` above 0, write-off spec §3.4; a bill passes
// none), Paid when nothing is open, Partly paid while part of the total is open, Overdue
// when due before today, else Open. Days are YYYY-MM-DD text, so they compare as strings.
function postedDueBadge(
    row: { balance: number; total: number; due_date: string },
    today: string,
    writtenOff = 0
): StatusBadge {
    if (row.balance <= 0 && writtenOff > 0) return { label: 'Written off', tone: 'muted' }
    if (row.balance <= 0) return { label: 'Paid', tone: 'success' }
    if (row.balance < row.total) return { label: 'Partly paid', tone: 'warning' }
    if (row.due_date !== '' && row.due_date < today)
        return { label: 'Overdue', tone: 'destructive' }
    return { label: 'Open', tone: 'warning' }
}

export function dueDocumentStatus(
    row: { status: string; balance: number; total: number; due_date: string },
    today: string,
    writtenOff = 0
): StatusBadge {
    return lifecycleStatus(row.status, postedDueBadge(row, today, writtenOff))
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

function receiptStatus(row: SalesReceiptInput): StatusBadge {
    return lifecycleStatus(row.status, { label: 'Paid', tone: 'success' })
}

// A posted payment reads Applied when nothing was kept as a credit, else Credit $x.
function paymentStatus(row: PaymentInput): StatusBadge {
    const posted: StatusBadge =
        row.credited > 0
            ? { label: `Credit ${formatMoney(row.credited, row.currency)}`, tone: 'warning' }
            : { label: 'Applied', tone: 'success' }
    return lifecycleStatus(row.status, posted)
}

// A posted credit memo reads Unapplied while credit is left on it (a memo partly applied or
// partly refunded too); with none left it reads Applied when a part of it was applied to
// invoices (`applied` above 0, apply credit spec §3.5), else Refunded: refund receipts paid
// out all of it (refund receipt spec §3.12). The Transactions tab, the Sales lists and the
// invoice's Credit memos section use it.
export function creditMemoStatus(row: {
    status: string
    balance: number
    applied: number
}): StatusBadge {
    const closed: StatusBadge =
        row.applied > 0
            ? { label: 'Applied', tone: 'success' }
            : { label: 'Refunded', tone: 'success' }
    return creditStatus(row, { open: { label: 'Unapplied', tone: 'warning' }, closed })
}

// A posted refund receipt reads Refunded (refund receipt spec §3.11–§3.13). The sales
// receipt's and the credit memo's sections, the Sales lists and the Transactions tab use it.
export function refundReceiptStatus(row: { status: string }): StatusBadge {
    return lifecycleStatus(row.status, { label: 'Refunded', tone: 'success' })
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
        status: dueDocumentStatus(row, today, row.written_off),
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

// A refund receipt's total is stored positive; the row negates it, as the money went back
// to the customer (refund receipt spec §3.13). It has no due date.
export function refundReceiptRow(row: RefundReceiptInput): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'refund_receipt',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: -row.total,
        currency: row.currency,
        created: row.created,
        status: refundReceiptStatus(row),
    }
}

// A write-off's amount is stored positive; the row negates it, as it lowers what the
// customer owes (write-off spec §3.6). A posted one reads Written off, muted; it is never a
// draft and has no due date.
export function writeOffRow(row: WriteOffInput): PartyTransactionRow {
    return {
        id: row.id,
        kind: 'write_off',
        number: row.number,
        date: row.date,
        dueDate: '',
        total: -row.amount,
        currency: row.currency,
        created: row.created,
        status: lifecycleStatus(row.status, { label: 'Written off', tone: 'muted' }),
    }
}

export function transactionTotalText(row: PartyTransactionRow<string>, currency: string): string {
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
function newestFirst(a: PartyTransactionRow<string>, b: PartyTransactionRow<string>): number {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.created !== b.created) return a.created < b.created ? 1 : -1
    return 0
}

// Each list is one source's first `n` rows in the same order, so the merged first `n` rows
// are exact. The window can grow when a list reached `n` (it may have more behind it) or
// when the lists hold more than `n` rows together (the cut left some out).
// `compare` must be the order every list is in (the sales lists pass their sort's).
export function mergeTransactions<Row extends PartyTransactionRow<string>>(
    lists: Row[][],
    n: number,
    compare: (a: Row, b: Row) => number = newestFirst
): { rows: Row[]; hasMore: boolean } {
    const all = lists.flat().sort(compare)
    const rows = all.slice(0, n)
    const hasMore = all.length > n || lists.some(list => list.length >= n)
    return { rows, hasMore }
}

const EMPTY_NOUNS: Record<TransactionKind, string> = {
    invoice: 'invoices',
    estimate: 'estimates',
    sales_receipt: 'sales receipts',
    payment: 'payments',
    credit_memo: 'credit memos',
    refund_receipt: 'refund receipts',
    write_off: 'write-offs',
}

export function emptyText(filter: TransactionFilter): string {
    if (filter === 'all') return 'No transactions for this customer yet'
    return `No ${EMPTY_NOUNS[filter]} for this customer`
}

// A chip's test id: `<prefix>-transactions-filter-<filter>`. A test id never holds an
// underscore.
export function partyFilterTestId(prefix: string, filter: string): string {
    return `${prefix}-transactions-filter-${filter.replaceAll('_', '-')}`
}

export function filterTestId(filter: TransactionFilter): string {
    return partyFilterTestId('customer', filter)
}
