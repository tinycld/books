// The rules of a sales document list (spec docs/specs/sales-lists-design.md §3, §4): the
// columns, the chips, the date range, the search and the sort, as TanStack DB clauses the
// list's live queries put in their `where`, and as the compare the merged window is sorted
// by. Pure, so each rule is unit-tested; hooks/useDocumentList.ts runs the queries.

import { and, eq, gt, gte, ilike, lt, lte, not, or, type Ref } from '@tanstack/db'
import { searchPieces } from './list-search'
import {
    mergeTransactions,
    type PartyTransactionRow,
    type TransactionKind,
} from './party-transactions'
import { type RangePreset, type RegisterRange, rangeForPreset } from './register-range'

export type ListColumnKey =
    | 'date'
    | 'type'
    | 'number'
    | 'customer'
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
    customer: string
}

export const DEFAULT_LIST_FILTERS: DocumentListFilters = {
    search: '',
    chip: 'all',
    range: 'all-dates',
    customer: '',
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
        filters.customer !== DEFAULT_LIST_FILTERS.customer
    )
}

export type ListChip = { id: string; label: string }

export type DocumentListTab = {
    key: string
    label: string
    path: string
    kinds: readonly TransactionKind[]
    // The plural the empty states name ("No invoices yet").
    noun: string
    newLabel: string
    // The kind's `new` route; null on a tab of several kinds, whose New is a menu.
    newHref: string | null
    columns: readonly ListColumnKey[]
    chips: readonly ListChip[]
    sortKeys: readonly ListSortKey[]
    // A credit memo's amount is negative on a signed tab, and sorts by its signed value.
    isSigned: boolean
}

// Header and rows share these, so the columns line up. Every column is flex with a
// minimum; the sum of the minimums is the width below which the list draws cards.
export const LIST_COLUMNS: Record<
    ListColumnKey,
    { label: string; minWidth: number; grow: number; align?: 'right'; sortKey?: ListSortKey }
> = {
    date: { label: 'Date', minWidth: 108, grow: 1.1, sortKey: 'date' },
    type: { label: 'Type', minWidth: 108, grow: 1.1 },
    number: { label: 'No.', minWidth: 64, grow: 0.7, sortKey: 'number' },
    customer: { label: 'Customer', minWidth: 150, grow: 2.2 },
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

// The Payments tab's amount column reads "Amount"; its cell is the total's.
export function columnLabel(tab: DocumentListTab, key: ListColumnKey): string {
    if (tab.key === 'payments' && key === 'total') return 'Amount'
    return LIST_COLUMNS[key].label
}

export function tableMinWidth(columns: readonly ListColumnKey[], canWrite: boolean): number {
    const cells = columns.reduce((sum, key) => sum + LIST_COLUMNS[key].minWidth, 0)
    const lead = canWrite ? EDGE_CELL_WIDTH : READER_LEFT_PAD
    return lead + cells + EDGE_CELL_WIDTH + ROW_RIGHT_PAD
}

type Clause = ReturnType<typeof eq>

// The fields the chip rules read. One ref type serves every kind, so all but the id are
// optional; each kind has the ones its rules use: a status, and an invoice its balance and
// due date, an estimate its expiration date, a payment what it credited, a credit memo its
// balance.
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
// spec's three additions (Open is every posted invoice with a balance, Credit left every
// "Credit $x" payment, an expired estimate only under Expired).
const KIND_TAB_RULES: Record<TransactionKind, Record<string, ChipRule>> = {
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
        // Refund receipt spec §3.12: a posted credit memo at balance 0 reads Refunded.
        refunded: isSettled,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
    refund_receipt: {
        refunded: isPosted,
        draft: isStatus('draft'),
        void: isStatus('void'),
    },
}

// The All sales chips per kind (spec §3's table); a kind the table gives "none" is absent,
// and that kind's query does not run under the chip.
const MIXED_TAB_RULES: Record<string, Partial<Record<TransactionKind, ChipRule>>> = {
    open: {
        invoice: hasBalance,
        estimate: (row, today) => and(isQuoteOpen(row), isNotExpired(row, today)),
        payment: hasCredit,
        credit_memo: hasBalance,
    },
    overdue: { invoice: isOverdue },
    closed: {
        invoice: isSettled,
        estimate: (row, today) =>
            or(eq(row.status, 'rejected'), eq(row.status, 'closed'), isExpiredQuote(row, today)),
        sales_receipt: isPosted,
        payment: isFullyApplied,
        credit_memo: isSettled,
        refund_receipt: isPosted,
    },
    draft: {
        invoice: isStatus('draft'),
        sales_receipt: isStatus('draft'),
        payment: isStatus('draft'),
        credit_memo: isStatus('draft'),
        refund_receipt: isStatus('draft'),
    },
    void: {
        invoice: isStatus('void'),
        sales_receipt: isStatus('void'),
        payment: isStatus('void'),
        credit_memo: isStatus('void'),
        refund_receipt: isStatus('void'),
    },
}

// A tab of several kinds (All sales) uses the All sales table; a tab of one kind uses
// that kind's chips. A chip the tab does not offer has no rule.
function chipRule(
    tab: DocumentListTab,
    chipId: string,
    kind: TransactionKind
): ChipRule | undefined {
    if (!tab.chips.some(chip => chip.id === chipId)) return undefined
    if (tab.kinds.length > 1) return MIXED_TAB_RULES[chipId]?.[kind]
    return KIND_TAB_RULES[kind][chipId]
}

// Whether the kind's query runs under the chip: the tab lists the kind, and the chip is
// All or lists some rows of that kind.
export function chipRuns(tab: DocumentListTab, chipId: string, kind: TransactionKind): boolean {
    if (!tab.kinds.includes(kind)) return false
    if (chipId === 'all') return true
    return chipRule(tab, chipId, kind) !== undefined
}

// The chip's clause for the kind's row ref; none for All (or a chip that does not run).
export function chipClause(
    tab: DocumentListTab,
    chipId: string,
    kind: TransactionKind,
    row: Ref<ChipFields>,
    today: string
): Clause | undefined {
    if (chipId === 'all') return undefined
    return chipRule(tab, chipId, kind)?.(row, today)
}

// A void original that a correction replaced is not listed: the correction carries its
// number (`isListedTransaction`). Invoices, sales receipts, payments, credit memos and
// refund receipts have `replaced_by`; estimates have no such rule.
export function listedClause(row: Ref<{ status: string; replaced_by: string }>): Clause {
    return or(not(eq(row.status, 'void')), eq(row.replaced_by, ''))
}

// The document date within the range, both ends included; none for All dates (`null`).
export function rangeClauses(row: Ref<{ date: string }>, range: RegisterRange | null): Clause[] {
    if (range === null) return []
    return [gte(row.date, range.start), lte(row.date, range.end)]
}

// Each typed piece in the number or the memo (the `searchPieces` rule of lib/list-search.ts:
// a piece holds no wildcard, so both the server and the store match it as plain text).
export function searchClauses(
    row: Ref<{ number: string; memo: string }>,
    search: string
): Clause[] {
    return searchPieces(search).map(piece =>
        or(ilike(row.number, `%${piece}%`), ilike(row.memo, `%${piece}%`))
    )
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
    refund_receipt: { date: 'date', number: 'sequence', amount: 'total' },
} as const satisfies Record<TransactionKind, Partial<Record<ListSortKey, string>>>

type SortFieldOf<K extends TransactionKind> = (typeof SORT_FIELDS)[K][keyof (typeof SORT_FIELDS)[K]]

// One signature per kind, so a query indexes its row ref by a column the row has.
export function sortField(kind: 'invoice', key: ListSortKey): SortFieldOf<'invoice'>
export function sortField(kind: 'estimate', key: ListSortKey): SortFieldOf<'estimate'>
export function sortField(kind: 'sales_receipt', key: ListSortKey): SortFieldOf<'sales_receipt'>
export function sortField(kind: 'payment', key: ListSortKey): SortFieldOf<'payment'>
export function sortField(kind: 'credit_memo', key: ListSortKey): SortFieldOf<'credit_memo'>
export function sortField(kind: 'refund_receipt', key: ListSortKey): SortFieldOf<'refund_receipt'>
export function sortField(kind: TransactionKind, key: ListSortKey): string {
    const fields: Partial<Record<ListSortKey, string>> = SORT_FIELDS[kind]
    const field = fields[key]
    if (field === undefined) throw new Error(`a ${kind} has no column for the ${key} sort`)
    return field
}

// A row's amount is its stored total negated for a credit memo on a signed tab and for a
// refund receipt on every tab (it always shows with a minus sign), so that kind's query
// orders the stored total the other way.
function isNegated(tab: DocumentListTab, kind: TransactionKind): boolean {
    return kind === 'refund_receipt' || (tab.isSigned && kind === 'credit_memo')
}

export function kindDirection(
    tab: DocumentListTab,
    kind: TransactionKind,
    sort: ListSort
): 'asc' | 'desc' {
    const isFlipped = sort.key === 'amount' && isNegated(tab, kind)
    return sort.isAscending !== isFlipped ? 'asc' : 'desc'
}

export type DocumentListRow = PartyTransactionRow & {
    // A draft's is 0.
    sequence: number
    customerId: string
    // The customer's display name, or '' for a document with no customer.
    customerName: string
    memo: string
    // A payment's, sales receipt's or refund receipt's reference no.; '' for the other kinds.
    reference: string
    // An estimate's expiration date; '' for the other kinds.
    expires: string
    // The stored open balance of an invoice or credit memo; 0 for the other kinds.
    balance: number
    // The posted document's journal entry; '' for a draft and an estimate.
    entry: string
    // The invoice an estimate was converted to; '' for the other kinds.
    convertedInvoice: string
    // The credit memo a refund receipt pays out (its Void dialog says so); '' or absent for
    // a plain refund and the other kinds.
    creditMemo?: string
    // The stored status (draft, posted, void, pending, …), beside the badge.
    recordStatus: string
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

export function documentListWindow(
    lists: DocumentListRow[][],
    n: number,
    sort: ListSort
): { rows: DocumentListRow[]; hasMore: boolean } {
    return mergeTransactions(lists, n, compareListRows(sort))
}

export type ListLayout = 'table' | 'cards' | 'names'

// What a list offers. A reader gets no New, no tick boxes and no Batch actions. The 320 px
// names column beside an open document keeps the New button and the search field only.
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
