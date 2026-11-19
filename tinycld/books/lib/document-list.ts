// The rules of a document list, sales and purchases (specs docs/specs/sales-lists-design.md
// and docs/specs/purchase-lists-design.md, §3 and §4): the columns, the chips, the date
// range, the search and the sort, as TanStack DB clauses the list's live queries put in
// their `where`, and as the compare the merged window is sorted by. Pure, so each rule is
// unit-tested; hooks/useDocumentList.ts runs the queries.

import { and, eq, gt, gte, ilike, lt, lte, not, or, type Ref } from '@tanstack/db'
import { documentHref } from './document-routes'
import type { ListAreaKey } from './list-areas'
import { searchPieces } from './list-search'
import type { LiveRecovery } from './live-recovery'
import {
    mergeTransactions,
    type PartyTransactionRow,
    TRANSACTION_DOC_KINDS,
    TRANSACTION_TYPE_LABELS,
    type TransactionKind,
} from './party-transactions'
import type { PurchaseCategory } from './purchase-category'
import { type RangePreset, type RegisterRange, rangeForPreset } from './register-range'
import {
    VENDOR_TRANSACTION_ROUTES,
    VENDOR_TRANSACTION_TYPE_LABELS,
    type VendorTransactionKind,
} from './vendor-transactions'

// Every kind a list holds: the sales kinds and the purchase kinds.
export type ListKind = TransactionKind | VendorTransactionKind

const SALES_KINDS: readonly ListKind[] = [
    'invoice',
    'estimate',
    'sales_receipt',
    'payment',
    'credit_memo',
] satisfies readonly TransactionKind[]

export function isSalesKind(kind: ListKind): kind is TransactionKind {
    return SALES_KINDS.includes(kind)
}

// A row of a sales kind: the customer page lists only those (`customerTransactionsTab`).
export function isSalesRow<Row extends { kind: ListKind }>(
    row: Row
): row is Row & { kind: TransactionKind } {
    return isSalesKind(row.kind)
}

// A row of a purchase kind: the vendor page lists only those (`vendorTransactionsTab`).
export function isPurchaseRow<Row extends { kind: ListKind }>(
    row: Row
): row is Row & { kind: VendorTransactionKind } {
    return !isSalesKind(row.kind)
}

// The kind of a row the list's Delete draft writes. A bill payment is never a draft, so
// neither its menu nor Delete drafts offers it (`purchaseRowMenuItems`, `batchTargets`);
// the error reaches the batch or the dialog as a refusal only by a programming error.
export function draftKindOf(row: { kind: ListKind }): Exclude<ListKind, 'bill_payment'> {
    const { kind } = row
    if (kind === 'bill_payment') throw new Error('A bill payment is never a draft.')
    return kind
}

// The Type column's text: Invoice, Bill, Vendor credit, …
export function kindLabel(kind: ListKind): string {
    if (isSalesKind(kind)) return TRANSACTION_TYPE_LABELS[kind]
    return VENDOR_TRANSACTION_TYPE_LABELS[kind]
}

// Where a row opens (without the org prefix): the kind's existing document route.
export function listDocumentHref(kind: ListKind, id: string): string {
    if (isSalesKind(kind)) return documentHref(TRANSACTION_DOC_KINDS[kind], id)
    return documentHref({ routeBase: VENDOR_TRANSACTION_ROUTES[kind] }, id)
}

export type ListColumnKey =
    | 'date'
    | 'type'
    | 'number'
    | 'customer'
    | 'vendor'
    | 'category'
    | 'memo'
    | 'reference'
    | 'due'
    | 'expires'
    | 'balance'
    | 'amount'
    | 'total'
    | 'status'

export type ListSortKey = 'date' | 'number' | 'amount' | 'due' | 'expires' | 'balance'

export type ListSort = { key: ListSortKey; isAscending: boolean }

export const DEFAULT_LIST_SORT: ListSort = { key: 'date', isAscending: false }

export type ListRange = RangePreset | 'all-dates'

export type DocumentListFilters = {
    search: string
    chip: string
    range: ListRange
    // The customer (Sales) or vendor (Expenses) id; '' for every party.
    party: string
}

export const DEFAULT_LIST_FILTERS: DocumentListFilters = {
    search: '',
    chip: 'all',
    range: 'all-dates',
    party: '',
}

// The dates a range filter keeps: none for All dates, else the preset's start and end,
// with the fiscal presets counted from the book's fiscal start month.
export function listRange(
    range: ListRange,
    today: string,
    fiscalStartMonth: number
): RegisterRange | null {
    if (range === 'all-dates') return null
    return rangeForPreset(range, today, fiscalStartMonth)
}

// Whether a filter narrows the list: the empty state then reads "No … match" with Clear
// filters. A search of only `%`, `_` or `\` has no piece, so it does not narrow it.
export function hasFilterSet(filters: DocumentListFilters): boolean {
    return (
        searchPieces(filters.search).length > 0 ||
        filters.chip !== DEFAULT_LIST_FILTERS.chip ||
        filters.range !== DEFAULT_LIST_FILTERS.range ||
        filters.party !== DEFAULT_LIST_FILTERS.party
    )
}

export type ListChip = { id: string; label: string }

export type DocumentListTab = {
    // Unique within the tab's area only: All sales and All purchases are both `all`, so a
    // per-tab state is kept under `tabStateKey(tab)`.
    key: string
    area: ListAreaKey
    label: string
    path: string
    kinds: readonly ListKind[]
    // The plural the empty states name ("No invoices yet").
    noun: string
    newLabel: string
    // The kind's `new` route; null on a tab of several kinds, whose New is a menu.
    newHref: string | null
    columns: readonly ListColumnKey[]
    chips: readonly ListChip[]
    sortKeys: readonly ListSortKey[]
    // A credit memo's or a vendor credit's amount is negative on a signed tab, and sorts by
    // its signed value.
    isSigned: boolean
}

// The key a tab's search, chip, range, party, sort, selection and window are kept under.
export function tabStateKey(tab: Pick<DocumentListTab, 'area' | 'key'>): string {
    return `${tab.area}:${tab.key}`
}

type ListColumn = {
    label: string
    minWidth: number
    grow: number
    align?: 'right'
    sortKey?: ListSortKey
}

// Header and rows share these, so the columns line up. Every column is flex with a
// minimum; the sum of the minimums is the width below which the list draws cards. Read a
// column through `listColumn`, which gives the area's Type minimum.
export const LIST_COLUMNS: Record<ListColumnKey, ListColumn> = {
    date: { label: 'Date', minWidth: 108, grow: 1.1, sortKey: 'date' },
    type: { label: 'Type', minWidth: 108, grow: 1.1 },
    number: { label: 'No.', minWidth: 64, grow: 0.7, sortKey: 'number' },
    customer: { label: 'Customer', minWidth: 150, grow: 2.2 },
    vendor: { label: 'Vendor', minWidth: 150, grow: 2.2 },
    category: { label: 'Category', minWidth: 130, grow: 2.2 },
    memo: { label: 'Memo', minWidth: 130, grow: 2.2 },
    reference: { label: 'Reference no.', minWidth: 130, grow: 1.8 },
    due: { label: 'Due date', minWidth: 108, grow: 1.1, sortKey: 'due' },
    expires: { label: 'Expires', minWidth: 108, grow: 1.1, sortKey: 'expires' },
    balance: { label: 'Balance', minWidth: 116, grow: 1.2, align: 'right', sortKey: 'balance' },
    amount: { label: 'Amount', minWidth: 116, grow: 1.2, align: 'right', sortKey: 'amount' },
    total: { label: 'Total', minWidth: 116, grow: 1.2, align: 'right', sortKey: 'amount' },
    status: { label: 'Status', minWidth: 128, grow: 0 },
}

// The tick box and the row menu each take a 44 px cell; a reader's rows have no tick box,
// so a pad starts them instead.
const EDGE_CELL_WIDTH = 44
const READER_LEFT_PAD = 16
const ROW_RIGHT_PAD = 8

// A purchase tab's Type column holds "Vendor credit" and "Vendor refund", so it is wider.
const PURCHASE_TYPE_MIN_WIDTH = 120

// The column as an area draws it: its label, minimum, grow, alignment and sort key.
export function listColumn(key: ListColumnKey, area: ListAreaKey): ListColumn {
    const column = LIST_COLUMNS[key]
    if (key === 'type' && area === 'purchases') {
        return { ...column, minWidth: PURCHASE_TYPE_MIN_WIDTH }
    }
    return column
}

// The Payments tab's amount column reads "Amount"; its cell is the total's.
export function columnLabel(tab: DocumentListTab, key: ListColumnKey): string {
    if (tab.area === 'sales' && tab.key === 'payments' && key === 'total') return 'Amount'
    return LIST_COLUMNS[key].label
}

// The table's own minimum width with the cells it draws: a tick box (`showTicks`, else a
// reader's left pad) and a row menu (`showRowMenus`) at the ends of each row.
export function tableMinWidthFor(
    tab: Pick<DocumentListTab, 'area' | 'columns'>,
    edges: { showTicks: boolean; showRowMenus: boolean }
): number {
    const cells = tab.columns.reduce((sum, key) => sum + listColumn(key, tab.area).minWidth, 0)
    const lead = edges.showTicks ? EDGE_CELL_WIDTH : READER_LEFT_PAD
    const trail = edges.showRowMenus ? EDGE_CELL_WIDTH : 0
    return lead + cells + trail + ROW_RIGHT_PAD
}

type Clause = ReturnType<typeof eq>

// The fields the chip rules read. One ref type serves every kind, so all but the id are
// optional; each kind has the ones its rules use: a status, and an invoice or a bill its
// balance and due date, an estimate its expiration date, a payment what it credited, a
// credit memo or a vendor credit its balance.
type ChipFields = {
    id: string
    status?: string
    balance?: number
    credited?: number
    due_date?: string
    expiration_date?: string
}

type ChipRule = (row: Ref<ChipFields>, today: string) => Clause

const isStatus = (status: string) => (row: Ref<ChipFields>) => eq(row.status, status)

const isPosted = isStatus('posted')

const hasBalance = (row: Ref<ChipFields>) => and(isPosted(row), gt(row.balance, 0))
const isSettled = (row: Ref<ChipFields>) => and(isPosted(row), eq(row.balance, 0))

// Overdue: posted, open, and due before today. Days are YYYY-MM-DD text, so they compare
// as strings; an empty due date is "before" every day, so it is ruled out first.
const isOverdue: ChipRule = (row, today) =>
    and(isPosted(row), gt(row.balance, 0), not(eq(row.due_date, '')), lt(row.due_date, today))

const isQuoteOpen = (row: Ref<ChipFields>) =>
    or(eq(row.status, 'pending'), eq(row.status, 'accepted'))

// Expired (`isExpired`, lib/estimate-status.ts): pending or accepted, with an expiration
// date before today.
const isExpiredQuote: ChipRule = (row, today) =>
    and(isQuoteOpen(row), not(eq(row.expiration_date, '')), lt(row.expiration_date, today))

const isNotExpired = (row: Ref<ChipFields>, today: string) =>
    or(eq(row.expiration_date, ''), gte(row.expiration_date, today))

const isQuoteStatus =
    (status: 'pending' | 'accepted'): ChipRule =>
    (row, today) =>
        and(eq(row.status, status), isNotExpired(row, today))

const hasCredit = (row: Ref<ChipFields>) => and(isPosted(row), gt(row.credited, 0))
const isFullyApplied = (row: Ref<ChipFields>) => and(isPosted(row), eq(row.credited, 0))

// The chips of a tab of one kind: the rows whose badge reads the chip's label, with the
// specs' additions (Open is every posted invoice or bill with a balance, Credit left every
// "Credit $x" payment, an expired estimate only under Expired).
const KIND_TAB_RULES: Record<ListKind, Record<string, ChipRule>> = {
    invoice: {
        open: hasBalance,
        overdue: isOverdue,
        paid: isSettled,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    estimate: {
        pending: isQuoteStatus('pending'),
        accepted: isQuoteStatus('accepted'),
        rejected: isStatus('rejected'),
        closed: isStatus('closed'),
        expired: isExpiredQuote,
    },
    sales_receipt: {
        paid: isPosted,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    payment: {
        applied: isFullyApplied,
        'credit-left': hasCredit,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    credit_memo: {
        unapplied: hasBalance,
        applied: isSettled,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    bill: {
        open: hasBalance,
        overdue: isOverdue,
        paid: isSettled,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    expense: {
        paid: isPosted,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    // A bill payment is never a draft.
    bill_payment: {
        paid: isPosted,
        void: isStatus('void'),
    },
    vendor_credit: {
        unapplied: hasBalance,
        closed: isSettled,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    vendor_refund: {
        received: isPosted,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
}

// The All sales and All purchases chips per kind (each spec's §3 table); a kind the table
// gives "none" is absent, and that kind's query does not run under the chip. The two
// areas share the chip ids and never a kind, so one table serves both.
const MIXED_TAB_RULES: Record<string, Partial<Record<ListKind, ChipRule>>> = {
    open: {
        invoice: hasBalance,
        estimate: (row, today) => and(isQuoteOpen(row), isNotExpired(row, today)),
        payment: hasCredit,
        credit_memo: hasBalance,
        bill: hasBalance,
        vendor_credit: hasBalance,
    },
    overdue: { invoice: isOverdue, bill: isOverdue },
    closed: {
        invoice: isSettled,
        estimate: (row, today) =>
            or(eq(row.status, 'rejected'), eq(row.status, 'closed'), isExpiredQuote(row, today)),
        sales_receipt: isPosted,
        payment: isFullyApplied,
        credit_memo: isSettled,
        bill: isSettled,
        expense: isPosted,
        bill_payment: isPosted,
        vendor_credit: isSettled,
        vendor_refund: isPosted,
    },
    draft: {
        invoice: isStatus('draft'),
        sales_receipt: isStatus('draft'),
        payment: isStatus('draft'),
        credit_memo: isStatus('draft'),
        bill: isStatus('draft'),
        expense: isStatus('draft'),
        vendor_credit: isStatus('draft'),
        vendor_refund: isStatus('draft'),
    },
    void: {
        invoice: isStatus('void'),
        sales_receipt: isStatus('void'),
        payment: isStatus('void'),
        credit_memo: isStatus('void'),
        bill: isStatus('void'),
        expense: isStatus('void'),
        bill_payment: isStatus('void'),
        vendor_credit: isStatus('void'),
        vendor_refund: isStatus('void'),
    },
}

// A tab of several kinds (All sales, All purchases) uses the mixed table; a tab of one
// kind uses that kind's chips. A chip the tab does not offer has no rule.
function chipRule(tab: DocumentListTab, chipId: string, kind: ListKind): ChipRule | undefined {
    if (!tab.chips.some(chip => chip.id === chipId)) return undefined
    if (tab.kinds.length > 1) return MIXED_TAB_RULES[chipId]?.[kind]
    return KIND_TAB_RULES[kind][chipId]
}

// Whether the kind's query runs under the chip: the tab lists the kind, and the chip is
// All or lists some rows of that kind.
export function chipRuns(tab: DocumentListTab, chipId: string, kind: ListKind): boolean {
    if (!tab.kinds.includes(kind)) return false
    if (chipId === 'all') return true
    return chipRule(tab, chipId, kind) !== undefined
}

// The chip's clause for the kind's row ref; none for All (or a chip that does not run).
export function chipClause(
    tab: DocumentListTab,
    chipId: string,
    kind: ListKind,
    row: Ref<ChipFields>,
    today: string
): Clause | undefined {
    if (chipId === 'all') return undefined
    return chipRule(tab, chipId, kind)?.(row, today)
}

// The chip's clause as a list for a query's `allOf`: empty for All.
export function chipClauses(
    tab: DocumentListTab,
    chipId: string,
    kind: ListKind,
    row: Ref<ChipFields>,
    today: string
): Clause[] {
    const clause = chipClause(tab, chipId, kind, row, today)
    return clause === undefined ? [] : [clause]
}

// A void original that a correction replaced is not listed: the correction carries its
// number (`isListedTransaction`). Invoices, sales receipts, payments, credit memos and the
// five purchase kinds have `replaced_by`; estimates have no such rule.
export function listedClause(row: Ref<{ status: string; replaced_by: string }>): Clause {
    return or(not(eq(row.status, 'void')), eq(row.replaced_by, ''))
}

// The document date within the range, both ends included; none for All dates (`null`).
export function rangeClauses(row: Ref<{ date: string }>, range: RegisterRange | null): Clause[] {
    if (range === null) return []
    return [gte(row.date, range.start), lte(row.date, range.end)]
}

// The fields a kind's search matches: the number, then the reference no. (a bill's and a
// vendor credit's `ref_no`; an expense's, a bill payment's and a vendor refund's
// `reference_no`), then the memo (a bill payment has none). The sales kinds match the
// number and the memo (`searchClauses`). Never the party's name.

// A text column of a row ref (`row.number`).
type TextRef = Ref<{ text: string }>['text']

// Each typed piece in one of the fields (the `searchPieces` rule of lib/list-search.ts: a
// piece holds no wildcard, so both the server and the store match it as plain text).
export function searchFieldClauses(
    fields: readonly [TextRef, TextRef, ...TextRef[]],
    search: string
): Clause[] {
    return searchPieces(search).map(piece => {
        const [first, second, ...rest] = fields.map(field => ilike(field, `%${piece}%`))
        return or(first, second, ...rest)
    })
}

// Each typed piece in the number or the memo: the sales kinds' search.
export function searchClauses(
    row: Ref<{ number: string; memo: string }>,
    search: string
): Clause[] {
    return searchFieldClauses([row.number, row.memo], search)
}

// Every clause in one expression; `and` never gets one argument.
export function allOf(clauses: readonly Clause[]): Clause {
    const [first, second, ...rest] = clauses
    if (first === undefined) throw new Error('allOf needs at least one clause')
    if (second === undefined) return first
    return and(first, second, ...rest)
}

// The column each kind sorts by for a sort key. A tab offers a key only when each of its
// kinds has the column, so a missing one (due on a payment) is a programming error.
const SORT_FIELDS = {
    invoice: {
        date: 'date',
        number: 'sequence',
        amount: 'total',
        due: 'due_date',
        balance: 'balance',
    },
    estimate: { date: 'date', number: 'sequence', amount: 'total', expires: 'expiration_date' },
    sales_receipt: { date: 'date', number: 'sequence', amount: 'total' },
    payment: { date: 'date', number: 'sequence', amount: 'amount' },
    credit_memo: { date: 'date', number: 'sequence', amount: 'total', balance: 'balance' },
    bill: {
        date: 'date',
        number: 'sequence',
        amount: 'total',
        due: 'due_date',
        balance: 'balance',
    },
    expense: { date: 'date', number: 'sequence', amount: 'total' },
    bill_payment: { date: 'date', number: 'sequence', amount: 'total' },
    vendor_credit: { date: 'date', number: 'sequence', amount: 'total', balance: 'balance' },
    vendor_refund: { date: 'date', number: 'sequence', amount: 'amount' },
} as const satisfies Record<ListKind, Partial<Record<ListSortKey, string>>>

type SortFieldOf<K extends ListKind> = (typeof SORT_FIELDS)[K][keyof (typeof SORT_FIELDS)[K]]

// One signature per kind, so a query indexes its row ref by a column the row has.
export function sortField(kind: 'invoice', key: ListSortKey): SortFieldOf<'invoice'>
export function sortField(kind: 'estimate', key: ListSortKey): SortFieldOf<'estimate'>
export function sortField(kind: 'sales_receipt', key: ListSortKey): SortFieldOf<'sales_receipt'>
export function sortField(kind: 'payment', key: ListSortKey): SortFieldOf<'payment'>
export function sortField(kind: 'credit_memo', key: ListSortKey): SortFieldOf<'credit_memo'>
export function sortField(kind: 'bill', key: ListSortKey): SortFieldOf<'bill'>
export function sortField(kind: 'expense', key: ListSortKey): SortFieldOf<'expense'>
export function sortField(kind: 'bill_payment', key: ListSortKey): SortFieldOf<'bill_payment'>
export function sortField(kind: 'vendor_credit', key: ListSortKey): SortFieldOf<'vendor_credit'>
export function sortField(kind: 'vendor_refund', key: ListSortKey): SortFieldOf<'vendor_refund'>
export function sortField(kind: ListKind, key: ListSortKey): string {
    const fields: Partial<Record<ListSortKey, string>> = SORT_FIELDS[kind]
    const field = fields[key]
    if (field === undefined) throw new Error(`a ${kind} has no column for the ${key} sort`)
    return field
}

// The kinds whose amount a signed tab shows negated: the credits.
const SIGNED_CREDIT_KINDS: readonly ListKind[] = ['credit_memo', 'vendor_credit']

// On a signed tab a credit memo's or a vendor credit's amount is its stored total negated,
// so its query orders the stored total the other way.
export function kindDirection(
    tab: DocumentListTab,
    kind: ListKind,
    sort: ListSort
): 'asc' | 'desc' {
    const isFlipped = tab.isSigned && SIGNED_CREDIT_KINDS.includes(kind) && sort.key === 'amount'
    return sort.isAscending !== isFlipped ? 'asc' : 'desc'
}

export type DocumentListRow = PartyTransactionRow<ListKind> & {
    // A draft's is 0.
    sequence: number
    // The customer (a sales row) or the vendor (a purchase row).
    partyId: string
    // The party's display name, or '' for a document with no party (an expense may have
    // no vendor).
    partyName: string
    // '' for a bill payment, which has no memo.
    memo: string
    // A payment's, sales receipt's, bill's, expense's, bill payment's, vendor credit's or
    // vendor refund's reference no.; '' for the other kinds.
    reference: string
    // An estimate's expiration date; '' for the other kinds.
    expires: string
    // The stored open balance of an invoice, credit memo, bill or vendor credit; 0 for the
    // other kinds.
    balance: number
    // The posted document's journal entry; '' for a draft and an estimate.
    entry: string
    // The invoice an estimate was converted to; '' for the other kinds.
    convertedInvoice: string
    // The stored status (draft, posted, void, pending, …), beside the badge.
    recordStatus: string
    // A bill's, expense's or vendor credit's Category (lib/purchase-category.ts); none for
    // every other kind.
    category: PurchaseCategory
}

function sortValue(row: DocumentListRow, key: ListSortKey): string | number {
    if (key === 'number') return row.sequence
    if (key === 'amount') return row.total
    if (key === 'due') return row.dueDate
    if (key === 'expires') return row.expires
    if (key === 'balance') return row.balance
    return row.date
}

// The order each kind's query gives, so the merge of their first rows is exact. An empty
// value ('' or a draft's sequence 0) is the least, so it sorts first ascending and last
// descending; rows with the same value are newest created first in both directions.
export function compareListRows(sort: ListSort) {
    const direction = sort.isAscending ? 1 : -1
    return (a: DocumentListRow, b: DocumentListRow): number => {
        const left = sortValue(a, sort.key)
        const right = sortValue(b, sort.key)
        if (left !== right) return left < right ? -direction : direction
        if (a.created !== b.created) return a.created < b.created ? 1 : -1
        return 0
    }
}

// What one area's query hook (hooks/useSalesListQueries.ts, hooks/usePurchaseListQueries.ts)
// reads: the tab, its filters as the queries put them in their `where`, the sort, the
// window size `n`, and the live-query key `useDocumentList` gives each kind's query.
export type ListQueryInput = {
    tab: DocumentListTab
    chip: string
    party: string
    search: string
    range: RegisterRange | null
    sort: ListSort
    today: string
    n: number
    queryKey: (kind: ListKind, runs: boolean) => unknown[]
}

// One kind's query as `useDocumentList` waits on it: whether it runs under the tab and the
// chip, its state, and what restarts it when it failed (the query and its sources).
export type ListRead = {
    isRunning: boolean
    isReady: boolean
    isError: boolean
    recovery: LiveRecovery
}

export function documentListWindow(
    lists: DocumentListRow[][],
    n: number,
    sort: ListSort
): { rows: DocumentListRow[]; hasMore: boolean } {
    return mergeTransactions(lists, n, compareListRows(sort))
}

export type ListLayout = 'table' | 'cards' | 'names'

// What a list offers. A reader gets no New, no tick boxes and no Batch actions. The 320 px
// names column beside an open document keeps the New button and the search field only, so it
// has no tick boxes, Batch actions, row menus or filters.
export function listControls(
    canWrite: boolean,
    layout: ListLayout
): {
    showNew: boolean
    showTicks: boolean
    showBatch: boolean
    showRowMenus: boolean
    showFilters: boolean
} {
    const isFullList = layout !== 'names'
    return {
        showNew: canWrite,
        showTicks: canWrite && isFullList,
        showBatch: canWrite && isFullList,
        showRowMenus: isFullList,
        showFilters: isFullList,
    }
}

export function emptyTexts(tab: DocumentListTab): { yet: string; match: string } {
    return { yet: `No ${tab.noun} yet`, match: `No ${tab.noun} match` }
}
