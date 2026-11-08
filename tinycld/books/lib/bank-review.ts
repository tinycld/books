import { and, eq, gt, gte, ilike, lt, lte, or, type Ref } from '@tanstack/db'
import type { SetupTab } from '@tinycld/core/components/setup/wizard/SetupTabs'
import { errorToString } from '@tinycld/core/lib/errors'
import type { BooksBankTransactions } from '../types'
import type { SelectBoxState } from './bank-import-view'
import { searchPieces } from './list-search'
import { formatMoney, parseMoney } from './money'
import { errorStatus, messageOnlyRefusal } from './refusal'
import {
    formatDay,
    RANGE_PRESETS,
    type RangePreset,
    type RegisterRange,
    rangeForPreset,
} from './register-range'

// The tabs of a bank account's panel, in tab-bar order. The three transaction tabs list
// the connection's rows of one status; Files holds the upload area and the file list.
export type ReviewTab = 'review' | 'reviewed' | 'excluded' | 'files'
export const REVIEW_TABS: readonly ReviewTab[] = ['review', 'reviewed', 'excluded', 'files']

export type TxnTab = Exclude<ReviewTab, 'files'>
export type TxnStatus = BooksBankTransactions['status']

export const TXN_STATUS_OF: Record<TxnTab, TxnStatus> = {
    review: 'for_review',
    reviewed: 'reviewed',
    excluded: 'excluded',
}

function isReviewTab(value: string): value is ReviewTab {
    return (REVIEW_TABS as readonly string[]).includes(value)
}

// The `tab` URL param as a tab. expo-router gives a repeated param as an array, so the
// first value counts; a missing or unknown value means For review, the default tab.
export function reviewTabFromParam(param: string | string[] | undefined): ReviewTab {
    const value = Array.isArray(param) ? param[0] : param
    return value !== undefined && isReviewTab(value) ? value : 'review'
}

const TAB_LABELS: Record<ReviewTab, string> = {
    review: 'For review',
    reviewed: 'Reviewed',
    excluded: 'Excluded',
    files: 'Files',
}

// Only For review carries a count: it is the tab that needs work.
export function reviewTabItems(reviewCount: number): SetupTab<ReviewTab>[] {
    return REVIEW_TABS.map(tab => {
        const label =
            tab === 'review' && reviewCount > 0
                ? `${TAB_LABELS.review} (${reviewCount})`
                : TAB_LABELS[tab]
        return { value: tab, label }
    })
}

export function reviewCountText(count: number): string {
    if (count === 0) return 'Nothing to review'
    return `${count} to review`
}

export type ReviewViewState = 'loading' | 'error' | 'empty' | 'no-match' | 'ready'

// A load error wins over rows still on screen, so Retry is always offered; an empty list
// under a filter is a no-match, not the tab's empty state.
export function reviewViewState(input: {
    isReady: boolean
    isError: boolean
    rowCount: number
    hasFilter: boolean
}): ReviewViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.rowCount > 0) return 'ready'
    return input.hasFilter ? 'no-match' : 'empty'
}

function waitingSentence(count: number): string {
    if (count === 1) return '1 file is waiting to import.'
    return `${count} files are waiting to import.`
}

export function reviewEmptyText(tab: TxnTab, waitingCount: number): string {
    if (tab === 'reviewed') {
        return 'No reviewed transactions yet. A transaction moves here when you match or categorize it.'
    }
    if (tab === 'excluded') {
        return 'No excluded transactions. Exclude a transaction in For review to keep it out of your books.'
    }
    if (waitingCount > 0) return `Nothing to review. ${waitingSentence(waitingCount)}`
    return 'Nothing to review. Upload a statement and import it to see its transactions here.'
}

// A signed amount as two unsigned columns: money out (negative) under Spent, money in
// under Received. A zero amount is neither.
export function txnAmountCells(
    amount: number,
    currency: string
): { spent: string; received: string } {
    if (amount < 0) return { spent: formatMoney(-amount, currency), received: '' }
    if (amount > 0) return { spent: '', received: formatMoney(amount, currency) }
    return { spent: '', received: '' }
}

function checkText(checkNumber: string): string {
    const trimmed = checkNumber.trim()
    return trimmed ? `Check ${trimmed}` : ''
}

function joinParts(parts: readonly string[]): string {
    return parts.filter(part => part !== '').join(' · ')
}

// A wide row's second line: the memo and the check number, each only when present.
export function txnSecondLine(memo: string, checkNumber: string): string {
    return joinParts([memo.trim(), checkText(checkNumber)])
}

// A phone card's second line: the day, then the check number when there is one.
export function txnPhoneLine(day: string, checkNumber: string): string {
    return joinParts([formatDay(day), checkText(checkNumber)])
}

export const REVIEW_ROW_HEIGHT = 56
export const REVIEW_CARD_HEIGHT = 72
export const REVIEW_TABLE_MIN_WIDTH = 720

// Header and rows read the same objects, so the columns line up.
export const REVIEW_CELLS = {
    check: { width: 44 },
    date: { width: 112 },
    description: { flex: 1, minWidth: 240 },
    spent: { width: 128 },
    received: { width: 128 },
} as const

// The toolbar of the three transaction tabs: one set for every tab and every account.
export type ReviewDatePreset = 'all' | RangePreset
export type ReviewType = 'all' | 'in' | 'out'
export type ReviewFilters = { search: string; preset: ReviewDatePreset; type: ReviewType }
export const EMPTY_REVIEW_FILTERS: ReviewFilters = { search: '', preset: 'all', type: 'all' }
export type DateOrder = 'newest' | 'oldest'

export const REVIEW_DATE_ITEMS: readonly { id: ReviewDatePreset; label: string }[] = [
    { id: 'all', label: 'All dates' },
    ...RANGE_PRESETS,
]

export const REVIEW_TYPE_ITEMS: readonly { id: ReviewType; label: string }[] = [
    { id: 'all', label: 'All transactions' },
    { id: 'in', label: 'Money in' },
    { id: 'out', label: 'Money out' },
]

// A search of only `%`, `_`, `\` or spaces has no pieces, so it filters nothing.
export function hasReviewFilter(filters: ReviewFilters): boolean {
    return (
        searchPieces(filters.search).length > 0 ||
        filters.preset !== 'all' ||
        filters.type !== 'all'
    )
}

// The whole search text as an amount in unsigned cents: a search finds money spent and
// received alike. Zero finds nothing, so it is no amount.
export function parseSearchAmount(text: string, currency: string): number | null {
    const cents = parseMoney(text.trim(), currency)
    if (cents === null || cents === 0) return null
    return Math.abs(cents)
}

export function reviewRange(
    preset: ReviewDatePreset,
    today: string,
    fiscalStart: number
): RegisterRange | null {
    if (preset === 'all') return null
    return rangeForPreset(preset, today, fiscalStart)
}

type TextColumn = Parameters<typeof ilike>[0]
type Clause = ReturnType<typeof eq>

// The other columns are typed as the transaction row's refs: `Parameters<typeof eq>[0]`
// reads the last overload of `eq`, which takes only an aggregate.
type TxnRef = Ref<BooksBankTransactions>

export type ReviewColumns = {
    connection: TxnRef['connection']
    status: TxnRef['status']
    description: TextColumn
    memo: TextColumn
    checkNumber: TextColumn
    amount: TxnRef['amount']
    date: TxnRef['date']
}

export type ReviewWhereInput = {
    connection: string
    status: TxnStatus
    filters: ReviewFilters
    range: RegisterRange | null
    currency: string
}

function allOf(first: Clause, rest: Clause[]): Clause {
    const [second, ...others] = rest
    return second === undefined ? first : and(first, second, ...others)
}

// Every piece of the search in the description, the memo or the check number; or, when
// the whole text reads as money, that amount spent or received.
function searchClause(columns: ReviewColumns, search: string, currency: string): Clause | null {
    const [first, ...rest] = searchPieces(search).map(piece =>
        or(
            ilike(columns.description, `%${piece}%`),
            ilike(columns.memo, `%${piece}%`),
            ilike(columns.checkNumber, `%${piece}%`)
        )
    )
    if (first === undefined) return null
    const textClause = allOf(first, rest)
    const cents = parseSearchAmount(search, currency)
    if (cents === null) return textClause
    return or(textClause, eq(columns.amount, cents), eq(columns.amount, -cents))
}

function typeClause(columns: ReviewColumns, type: ReviewType): Clause | null {
    if (type === 'in') return gt(columns.amount, 0)
    if (type === 'out') return lt(columns.amount, 0)
    return null
}

// The `where` of a transaction tab's read: the connection and the tab's status, then the
// search, the range and the type. pbtsdb sends it to the server as the request filter and
// TanStack DB applies it to the rows in the store. `and` and `or` never get one argument
// (lib/list-search.ts). Dates are ISO days in a text field, so the range compares as text.
export function reviewWhere(columns: ReviewColumns, input: ReviewWhereInput): Clause {
    const clauses: Clause[] = [eq(columns.status, input.status)]
    const search = searchClause(columns, input.filters.search, input.currency)
    if (search) clauses.push(search)
    if (input.range) {
        clauses.push(gte(columns.date, input.range.start), lte(columns.date, input.range.end))
    }
    const type = typeClause(columns, input.filters.type)
    if (type) clauses.push(type)
    return allOf(eq(columns.connection, input.connection), clauses)
}

// The rows a list shows, with the query key they came from.
export type SettledRows<Row> = { key: string; rows: readonly Row[]; viewState: ReviewViewState }

function sameRows<Row>(a: readonly Row[], b: readonly Row[]) {
    return a.length === b.length && a.every((row, i) => row === b[i])
}

// A new search, filter or order starts a new query, which loads before it shows. Until it
// settles the last settled rows stay on screen, so the search field being typed in stays
// mounted and the list does not blank. A load under the same key keeps the last state but
// shows the current rows, so a row that left the list does not come back. The kept value
// is replaced only when its contents differ, so a caller that stores it converges.
// A failed load is never shown under a later load: Retry recovers the current query, so the error on screen
// must be the current query's own, and a new query that loads shows its loading state.
// (As keepLastSettled, lib/list-state.ts, keyed by the query key.)
export function settleRows<Row>(
    prev: SettledRows<Row> | undefined,
    now: SettledRows<Row>
): { next: SettledRows<Row> | undefined; shown: SettledRows<Row> } {
    const isSameKey = prev !== undefined && prev.key === now.key
    if (now.viewState === 'loading') {
        if (prev?.viewState === 'error') return { next: undefined, shown: now }
        if (isSameKey) return { next: prev, shown: { ...prev, rows: now.rows } }
        return { next: prev, shown: prev ?? now }
    }
    if (isSameKey && prev.viewState === now.viewState && sameRows(prev.rows, now.rows)) {
        return { next: prev, shown: prev }
    }
    return { next: now, shown: now }
}

// Exclude and Move to For review: what each sets a transaction's status to. The server's
// update rule allows only these two moves (pb-migrations/2100000008_create_books_banking.js).
export type BatchKind = 'exclude' | 'restore'
export const BATCH_TARGET: Record<BatchKind, TxnStatus> = {
    exclude: 'excluded',
    restore: 'for_review',
}

export type BatchFailure = { id: string; message: string; isTransport: boolean }
export type BatchOutcome = { done: string[]; failed: BatchFailure[] }

export const BANK_BATCH_TRANSPORT_TEXT =
    'The change could not be sent. Check your connection and try again.'

function firstFieldMessage(error: unknown): string | null {
    const data = (error as { response?: { data?: unknown } } | null)?.response?.data
    if (typeof data !== 'object' || data === null) return null
    for (const value of Object.values(data)) {
        const message = (value as { message?: unknown } | null)?.message
        if (typeof message === 'string' && message !== '') return message
    }
    return null
}

// One refused or unsent status change. A write with no HTTP status (0, or none at all)
// and no server message never reached the server.
export function batchFailure(id: string, error: unknown): BatchFailure {
    const refusal = messageOnlyRefusal(error)
    const status = errorStatus(error)
    const isTransport = (status === 0 || status === undefined) && refusal === null
    const message = refusal ?? firstFieldMessage(error) ?? errorToString(error)
    return { id, message, isTransport }
}

function transactionsNoun(count: number): string {
    return count === 1 ? 'transaction' : 'transactions'
}

const DONE_TEXT: Record<BatchKind, (count: number) => string> = {
    exclude: count => `Excluded ${count} ${transactionsNoun(count)}.`,
    restore: count => `Moved ${count} ${transactionsNoun(count)} to For review.`,
}

const FAILED_VERB: Record<BatchKind, string> = {
    exclude: 'excluded',
    restore: 'moved to For review',
}

// The line under the toolbar after a batch: the count when every change went through;
// the transport text when none of the failures reached the server; the server's message
// when every failure is a refusal with the same non-empty one; else how many of the
// batch failed. A failure with no message (a row that left the store before its change
// was sent) is only counted.
export function batchResultText(
    kind: BatchKind,
    outcome: BatchOutcome
): { text: string; tone: 'muted' | 'danger' } {
    const { done, failed } = outcome
    const [first] = failed
    if (first === undefined) return { text: DONE_TEXT[kind](done.length), tone: 'muted' }
    if (failed.every(failure => failure.isTransport)) {
        return { text: BANK_BATCH_TRANSPORT_TEXT, tone: 'danger' }
    }
    const isOneRefusal = failed.every(
        failure =>
            !failure.isTransport && failure.message !== '' && failure.message === first.message
    )
    if (isOneRefusal) return { text: first.message, tone: 'danger' }
    const total = done.length + failed.length
    return {
        text: `${failed.length} of ${total} transactions could not be ${FAILED_VERB[kind]}. Try again.`,
        tone: 'danger',
    }
}

export function chunksOf<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let start = 0; start < items.length; start += size) {
        chunks.push(items.slice(start, start + size))
    }
    return chunks
}

// The drawer's From file line: "oct-2026.csv, line 7"; nothing when the file is unknown.
export function txnSourceText(fileName: string, line: number): string {
    if (!fileName) return ''
    return `${fileName}, line ${line}`
}

const STATUS_LABELS: Record<TxnStatus, string> = {
    for_review: 'For review',
    reviewed: 'Reviewed',
    excluded: 'Excluded',
}

export function txnStatusLabel(status: TxnStatus): string {
    return STATUS_LABELS[status]
}

export type ReviewAction = { kind: BatchKind; label: string; busyLabel: string }

// The drawer's one action follows the transaction's own status: a writer excludes a
// for-review row and moves an excluded one back; a reviewed row and a reader get none.
export function drawerAction(
    status: TxnStatus,
    canWrite: boolean
): (ReviewAction & { testID: 'bank-txn-exclude' | 'bank-txn-restore' }) | null {
    if (!canWrite) return null
    if (status === 'for_review') {
        return {
            kind: 'exclude',
            label: 'Exclude',
            busyLabel: 'Excluding…',
            testID: 'bank-txn-exclude',
        }
    }
    if (status === 'excluded') {
        return {
            kind: 'restore',
            label: 'Move to For review',
            busyLabel: 'Moving…',
            testID: 'bank-txn-restore',
        }
    }
    return null
}

// Rows are chosen only to batch them: on For review and Excluded, by a writer.
export function canChoose(tab: TxnTab, canWrite: boolean): boolean {
    return canWrite && tab !== 'reviewed'
}

type ChoiceRow = { id: string }

// The chosen ids that the list shows, in list order. The store may still hold an id that
// left the list (a new search hid it, or another user's change took it away); every
// reader and every write of the choice goes through this, so such an id counts nowhere.
export function shownChoice(rows: readonly ChoiceRow[], chosen: ReadonlySet<string>): string[] {
    return rows.filter(row => chosen.has(row.id)).map(row => row.id)
}

function selectedText(count: number, spent: number, received: number, currency: string) {
    return `${count} selected · Spent ${formatMoney(spent, currency)} · Received ${formatMoney(received, currency)}`
}

// The selection bar's count and sums, over the shown choice only. Amounts are integer
// cents, so the sums are exact; `spent` is positive.
export function selectionSummary(
    rows: readonly (ChoiceRow & { amount: number })[],
    chosen: ReadonlySet<string>,
    currency: string
): { count: number; spent: number; received: number; text: string } {
    let count = 0
    let spent = 0
    let received = 0
    for (const row of rows) {
        if (!chosen.has(row.id)) continue
        count += 1
        if (row.amount < 0) spent -= row.amount
        else received += row.amount
    }
    return { count, spent, received, text: selectedText(count, spent, received, currency) }
}

// The select-all box: checked when every shown row is chosen (and there is one), empty
// when none is, mixed otherwise.
export function selectAllState(
    rows: readonly ChoiceRow[],
    chosen: ReadonlySet<string>
): SelectBoxState {
    const count = shownChoice(rows, chosen).length
    if (count === 0) return 'empty'
    return count === rows.length ? 'checked' : 'mixed'
}

// The shown choice with `id` flipped, in list order.
export function toggleChoice(
    rows: readonly ChoiceRow[],
    chosen: ReadonlySet<string>,
    id: string
): string[] {
    const isChosen = chosen.has(id)
    return rows.filter(row => (row.id === id ? !isChosen : chosen.has(row.id))).map(row => row.id)
}

// Every shown row, or none when every shown row is already chosen.
export function toggleAllChoice(rows: readonly ChoiceRow[], chosen: ReadonlySet<string>): string[] {
    if (selectAllState(rows, chosen) === 'checked') return []
    return rows.map(row => row.id)
}

// Every write control of the queue: disabled while a change runs or while the server
// cannot take writes; the hint says why only in the second case.
export function writeControlState(input: {
    isPending: boolean
    writesDisabled: boolean
    writesHint: string | undefined
}): { isDisabled: boolean; hint: string | undefined } {
    return {
        isDisabled: input.isPending || input.writesDisabled,
        hint: input.writesDisabled ? input.writesHint : undefined,
    }
}
