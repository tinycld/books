// The pure rules of the reconcile screens (reconcile spec §3): which accounts can be
// reconciled, the words of each side, the band's sums, the start form's rules, the target
// of `books/reconcile?account=<id>`, and the texts. All money is integer cents. Kept apart
// from the components so tests/reconcile.test.ts can run them over the case table the Go
// test runs too (server/testdata/reconcile_cases.json).
import { z } from '@tinycld/core/ui/form'
import type { BooksAccounts, BooksReconcileLines, BooksReconciliations } from '../types'
import type { SelectBoxState } from './bank-import-view'
import { searchPieces } from './list-search'
import {
    formatMoney,
    isWellFormedMoney,
    maxStoredAmount,
    parseMoney,
    TOO_LARGE_TEXT,
} from './money'
import { entryTypeLabel } from './register'
import { formatDay, isIsoDay } from './register-range'
import { parseSearchAmount } from './search-amount'

// The account types the server's create hook takes (server/reconcile.go); the detail type
// is not read.
export const RECONCILE_ACCOUNT_TYPES = [
    'bank',
    'credit_card',
] as const satisfies readonly BooksAccounts['type'][]

const reconcileTypes: ReadonlySet<string> = new Set(RECONCILE_ACCOUNT_TYPES)

export function isReconcileAccountType(type: string): boolean {
    return reconcileTypes.has(type)
}

// The credit side ("out") is a bank account's payments and a card's charges; the debit side
// ("in") is a bank account's deposits and a card's payments. The operators are those of the
// band's second line: a bank payment lowers the balance, a card charge raises what is owed.
const BANK_WORDS = {
    out: 'Payments',
    in: 'Deposits',
    outColumn: 'Payment',
    inColumn: 'Deposit',
    outOne: 'payment',
    outMany: 'payments',
    inOne: 'deposit',
    inMany: 'deposits',
    outOperator: '−',
    inOperator: '+',
}

export type SideWords = typeof BANK_WORDS

const CARD_WORDS: SideWords = {
    out: 'Charges',
    in: 'Payments',
    outColumn: 'Charge',
    inColumn: 'Payment',
    outOne: 'charge',
    outMany: 'charges',
    inOne: 'payment',
    inMany: 'payments',
    outOperator: '+',
    inOperator: '−',
}

export function sideWords(accountType: string): SideWords {
    return accountType === 'credit_card' ? CARD_WORDS : BANK_WORDS
}

export type ReconcileTotals = {
    beginning: number
    clearedOut: number
    clearedIn: number
    outCount: number
    inCount: number
    clearedBalance: number
    difference: number
    // The statement's total less the cleared sum of that side: 0 when they agree, positive
    // when the cleared side is under the statement, negative when it is over. null when the
    // statement totals were not entered.
    outOff: number | null
    inOff: number | null
    // A sum above maxStoredAmount cannot be shown exactly: the band shows TOO_LARGE_TEXT.
    isTooLarge: boolean
}

type TotalsReconciliation = Pick<
    BooksReconciliations,
    | 'beginning_balance'
    | 'statement_balance'
    | 'has_statement_totals'
    | 'statement_out'
    | 'statement_in'
>

// One pass over the rows. A bank balance is the money in the account (a deposit raises it, a
// payment lowers it); a card balance is the amount owed (a charge raises it, a payment
// lowers it).
export function reconcileTotals(
    rows: readonly { debit: number; credit: number; isCleared: boolean }[],
    reconciliation: TotalsReconciliation,
    accountType: string
): ReconcileTotals {
    let clearedOut = 0
    let clearedIn = 0
    let outCount = 0
    let inCount = 0
    for (const row of rows) {
        if (!row.isCleared) continue
        if (row.credit > 0) {
            clearedOut += row.credit
            outCount += 1
        }
        if (row.debit > 0) {
            clearedIn += row.debit
            inCount += 1
        }
    }
    const beginning = reconciliation.beginning_balance
    const outSign = accountType === 'credit_card' ? 1 : -1
    const clearedBalance = beginning + outSign * clearedOut - outSign * clearedIn
    const difference = reconciliation.statement_balance - clearedBalance
    const hasTotals = reconciliation.has_statement_totals
    const isTooLarge = [clearedOut, clearedIn, clearedBalance, difference].some(
        value => Math.abs(value) > maxStoredAmount
    )
    return {
        beginning,
        clearedOut,
        clearedIn,
        outCount,
        inCount,
        clearedBalance,
        difference,
        outOff: hasTotals ? reconciliation.statement_out - clearedOut : null,
        inOff: hasTotals ? reconciliation.statement_in - clearedIn : null,
        isTooLarge,
    }
}

// The band of a finished reconciliation reads the sums the server stamped at finish
// (server/reconcile.go), not the lines: its lines are reconciled and the lines query does
// not run for it.
export function stampedTotals(
    reconciliation: TotalsReconciliation &
        Pick<
            BooksReconciliations,
            'cleared_out' | 'cleared_in' | 'cleared_out_count' | 'cleared_in_count'
        >,
    accountType: string
): ReconcileTotals {
    const rows = [
        { debit: 0, credit: reconciliation.cleared_out, isCleared: true },
        { debit: reconciliation.cleared_in, credit: 0, isCleared: true },
    ]
    return {
        ...reconcileTotals(rows, reconciliation, accountType),
        outCount: reconciliation.cleared_out_count,
        inCount: reconciliation.cleared_in_count,
    }
}

export const RECONCILE_START_ERRORS = {
    balanceEmpty: 'Enter the statement ending balance.',
    amountMalformed: 'Enter an amount like 1,234.50.',
    amountTooLarge: 'The amount is too large.',
    amountNegative: 'Enter an amount of 0 or more.',
    dateInvalid: 'Enter a date as YYYY-MM-DD.',
    dateAfterToday: 'The date cannot be after today.',
    totalsBoth: 'Enter both totals, or neither.',
} as const

export function dateAfterLastText(lastDate: string): string {
    return `The date must be after ${formatDay(lastDate)}, the last reconciled statement.`
}

// The typed text, as the form holds it.
export type ReconcileStartValues = {
    balance: string
    date: string
    statementOut: string
    statementIn: string
}

// Well-formed text that parseMoney cannot hold is above maxStoredAmount.
function moneyError(text: string): string | null {
    if (!isWellFormedMoney(text)) return RECONCILE_START_ERRORS.amountMalformed
    if (parseMoney(text) === null) return RECONCILE_START_ERRORS.amountTooLarge
    return null
}

function balanceError(text: string): string | null {
    if (text.trim() === '') return RECONCILE_START_ERRORS.balanceEmpty
    return moneyError(text)
}

// An empty total is no error here: the both-or-neither rule speaks for it.
function statementTotalError(text: string): string | null {
    if (text.trim() === '') return null
    const error = moneyError(text)
    if (error !== null) return error
    if ((parseMoney(text) ?? 0) < 0) return RECONCILE_START_ERRORS.amountNegative
    return null
}

// `lastDate` is the statement date of the account's last finished reconciliation ('' when it
// has none); the server refuses a date on or before it too. `today` is the client's day: the
// server does not check it, because its day can differ from the user's.
export function reconcileStartSchema(
    lastDate: string,
    today: string
): z.ZodType<ReconcileStartValues, ReconcileStartValues> {
    return z
        .object({
            balance: z.string(),
            date: z.string(),
            statementOut: z.string(),
            statementIn: z.string(),
        })
        .superRefine((values, ctx) => {
            const issue = (path: keyof ReconcileStartValues, message: string) =>
                ctx.addIssue({ code: 'custom', path: [path], message })
            const balance = balanceError(values.balance)
            if (balance !== null) issue('balance', balance)
            if (!isIsoDay(values.date)) issue('date', RECONCILE_START_ERRORS.dateInvalid)
            else if (lastDate !== '' && values.date <= lastDate) {
                issue('date', dateAfterLastText(lastDate))
            } else if (values.date > today) issue('date', RECONCILE_START_ERRORS.dateAfterToday)
            const out = statementTotalError(values.statementOut)
            if (out !== null) issue('statementOut', out)
            const into = statementTotalError(values.statementIn)
            if (into !== null) issue('statementIn', into)
            const hasOut = values.statementOut.trim() !== ''
            const hasIn = values.statementIn.trim() !== ''
            if (hasOut !== hasIn) issue('statementIn', RECONCILE_START_ERRORS.totalsBoth)
        })
}

// The fields of the start's insert (and of Edit info's update) from values the schema took.
export function reconcileStartFields(
    values: ReconcileStartValues
): Pick<
    BooksReconciliations,
    | 'statement_date'
    | 'statement_balance'
    | 'has_statement_totals'
    | 'statement_out'
    | 'statement_in'
> {
    const hasTotals = values.statementOut.trim() !== '' && values.statementIn.trim() !== ''
    return {
        statement_date: values.date,
        statement_balance: parseMoney(values.balance) ?? 0,
        has_statement_totals: hasTotals,
        statement_out: hasTotals ? (parseMoney(values.statementOut) ?? 0) : 0,
        statement_in: hasTotals ? (parseMoney(values.statementIn) ?? 0) : 0,
    }
}

export type AccountParamTarget =
    | { kind: 'work'; id: string }
    | { kind: 'start'; accountId: string }
    | { kind: 'none' }

// Where `books/reconcile?account=<id>` goes: the work screen of the account's reconciliation
// in progress, else the start dialog of a listed account. A reader, an unknown id and an
// account that cannot be reconciled stay on the accounts screen. `paramInProgress` is the
// reconciliation in progress read for an account the rows do not list (an inactive one).
export function accountParamTarget(input: {
    accountId: string | undefined
    canWrite: boolean
    rows: readonly { account: { id: string; type: string }; inProgress?: { id: string } }[]
    paramInProgress: { id: string; account: string } | undefined
}): AccountParamTarget {
    const { accountId, canWrite, rows, paramInProgress } = input
    if (!accountId || !canWrite) return { kind: 'none' }
    const row = rows.find(candidate => candidate.account.id === accountId)
    if (row) {
        if (!isReconcileAccountType(row.account.type)) return { kind: 'none' }
        if (row.inProgress) return { kind: 'work', id: row.inProgress.id }
        return { kind: 'start', accountId }
    }
    if (paramInProgress && paramInProgress.account === accountId) {
        return { kind: 'work', id: paramInProgress.id }
    }
    return { kind: 'none' }
}

export const RECONCILE_TEXTS = {
    accountsLine: 'Compare an account with its bank statement.',
    accountsLoadError: 'Books could not load the accounts.',
    accountsEmpty: 'No bank or credit card account yet. Add one in the Chart of Accounts.',
    openChart: 'Open Chart of Accounts',
    never: 'Never',
    neverReconciled: 'Never reconciled',
    firstNote:
        'This account has not been reconciled. Its opening balance is a transaction to clear.',
    totalsHint: "When you enter the statement's totals, Books shows which side is off.",
    starting: 'Starting…',
    loadError: 'Books could not load this reconciliation.',
    notFound: 'This reconciliation does not exist.',
    balanced: 'Balanced',
    notBalanced: 'Not balanced',
    showBalances: 'Show the balances',
    hideBalances: 'Hide the balances',
    sendFailed: 'The change could not be sent. Check your connection and try again.',
    searchPlaceholder: 'Search number, payee, memo or amount',
    clearFilters: 'Clear filters',
    noMatch: 'No transactions match these filters.',
    selectAllLabel: 'Clear all shown transactions',
    clearAllShown: 'Clear all shown',
    oldestFirst: 'Oldest first',
    newestFirst: 'Newest first',
    matchedLabel: 'Matched to a bank transaction',
    clearedMark: 'Cleared',
} as const

// The work screen's filters (spec §3 "Toolbar"): the side tab, the search text and the Show
// choice. `out` is the credit side, `in` the debit side (sideWords).
export type ReconcileSide = 'all' | 'out' | 'in'
export type ReconcileShow = 'all' | 'uncleared' | 'cleared'
export type ReconcileFilters = { side: ReconcileSide; search: string; show: ReconcileShow }
export type ReconcileSortColumn = 'date' | 'out' | 'in'
export type ReconcileSort = { column: ReconcileSortColumn; direction: 'asc' | 'desc' }

export const RECONCILE_DEFAULT_FILTERS: ReconcileFilters = { side: 'all', search: '', show: 'all' }
export const RECONCILE_DEFAULT_SORT: ReconcileSort = { column: 'date', direction: 'asc' }

export const RECONCILE_SHOW_LABELS: Record<ReconcileShow, string> = {
    all: 'All transactions',
    uncleared: 'Not cleared',
    cleared: 'Cleared',
}

// The search has text when it holds more than spaces: the one rule of "Clear filters"
// (hasReconcileFilter) and Esc (hooks/useReconcileShortcuts.ts).
export function hasSearchText(search: string): boolean {
    return search.trim() !== ''
}

// "Clear filters" shows while a side, a search or a Show choice is set.
export function hasReconcileFilter(filters: ReconcileFilters): boolean {
    return filters.side !== 'all' || hasSearchText(filters.search) || filters.show !== 'all'
}

// A second press on the sorted column reverses it; a press on another column sorts it
// ascending.
export function nextReconcileSort(sort: ReconcileSort, column: ReconcileSortColumn): ReconcileSort {
    if (sort.column !== column) return { column, direction: 'asc' }
    return { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
}

// The lines query's row as the pure helpers read it: the view's columns, then whether the
// row has its books_reconciliation_lines row (hooks/useReconcileLines.ts).
type ShownLine = Pick<
    BooksReconcileLines,
    'id' | 'date' | 'number' | 'payee' | 'memo' | 'debit' | 'credit'
> & { isCleared: boolean }

// A line is on one side only, so its amount is the side's figure.
function lineAmount(line: ShownLine): number {
    return line.credit > 0 ? line.credit : line.debit
}

function keepsLine(
    line: ShownLine,
    filters: ReconcileFilters,
    pieces: readonly string[],
    amount: number | null
): boolean {
    if (filters.side === 'out' && line.credit === 0) return false
    if (filters.side === 'in' && line.debit === 0) return false
    if (filters.show === 'uncleared' && line.isCleared) return false
    if (filters.show === 'cleared' && !line.isCleared) return false
    if (pieces.length === 0) return true
    if (amount !== null && lineAmount(line) === amount) return true
    const text = `${line.number} ${line.payee} ${line.memo}`.toLowerCase()
    return pieces.every(piece => text.includes(piece))
}

const numberOrder = new Intl.Collator('en', { numeric: true })

// The list's own order: date, then entry number (numeric, "9" before "10"), then id.
function compareByDate(a: ShownLine, b: ShownLine): number {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const byNumber = numberOrder.compare(a.number, b.number)
    if (byNumber !== 0) return byNumber
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

function sideAmount(line: ShownLine, column: 'out' | 'in'): number {
    return column === 'out' ? line.credit : line.debit
}

function comparerOf(sort: ReconcileSort): (a: ShownLine, b: ShownLine) => number {
    const sign = sort.direction === 'asc' ? 1 : -1
    const { column } = sort
    if (column === 'date') return (a, b) => sign * compareByDate(a, b)
    // An amount sort keeps the rows of the other side last, in the list's own order.
    return (a, b) => {
        const left = sideAmount(a, column)
        const right = sideAmount(b, column)
        if (left > 0 !== right > 0) return left > 0 ? -1 : 1
        if (left !== right) return sign * (left - right)
        return compareByDate(a, b)
    }
}

// The rows the list shows: one pass to filter, then one sort. Every piece of the search
// (searchPieces) is in the number, the payee or the memo, case ignored; a search that reads
// as an amount (parseSearchAmount) also keeps the rows of that amount. `currency` is the
// reconciliation's; without one it is USD, the work screen's own fallback
// (hooks/useReconcileScreen.ts).
export function shownRows<T extends ShownLine>(
    rows: readonly T[],
    filters: ReconcileFilters,
    sort: ReconcileSort,
    currency = 'USD'
): T[] {
    const pieces = searchPieces(filters.search.toLowerCase())
    const amount = pieces.length > 0 ? parseSearchAmount(filters.search, currency) : null
    const kept = rows.filter(line => keepsLine(line, filters, pieces, amount))
    return kept.sort(comparerOf(sort))
}

// The header box and "Clear all shown": checked when every shown row is cleared, mixed
// when some are.
export function allShownState(rows: readonly { isCleared: boolean }[]): SelectBoxState {
    const cleared = rows.filter(row => row.isCleared).length
    if (cleared === 0) return 'empty'
    return cleared === rows.length ? 'checked' : 'mixed'
}

// The rows Clear matched clears: matched to a bank transaction and not cleared, whatever
// the filters.
export function matchedOpenRows<T extends { bank_matched: boolean; isCleared: boolean }>(
    rows: readonly T[]
): T[] {
    return rows.filter(row => row.bank_matched && !row.isCleared)
}

export function clearMatchedText(count: number): string {
    return `Clear matched (${count})`
}

// What a sort header shows for `column` (ListSortHeaderCell's `sorted`).
export function sortStateOf(
    sort: ReconcileSort,
    column: ReconcileSortColumn
): 'ascending' | 'descending' | 'none' {
    if (sort.column !== column) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
}

// The phone bar's order toggle, in words: the order shown now.
export function dateOrderText(sort: ReconcileSort): string {
    const isNewest = sort.column === 'date' && sort.direction === 'desc'
    return isNewest ? RECONCILE_TEXTS.newestFirst : RECONCILE_TEXTS.oldestFirst
}

// "Expense 12": the entry's type and its number, as the Transaction column and the clear
// box's label read it.
export function lineTypeNumber(
    line: Pick<BooksReconcileLines, 'origin' | 'doc_type' | 'number'>
): string {
    return `${entryTypeLabel(line.origin, '', line.doc_type)} ${line.number}`
}

// A table amount cell: the side's amount without a sign, '' on the other side.
export function amountCellText(cents: number, currency: string): string {
    return cents > 0 ? formatMoney(cents, currency) : ''
}

// A card's amount, signed by its effect on the account's balance: a bank payment and a
// card payment lower it ("-$250.00"); a deposit and a charge raise it ("$250.00").
export function signedLineText(
    line: Pick<BooksReconcileLines, 'debit' | 'credit'>,
    accountType: string,
    currency: string
): string {
    const isCard = accountType === 'credit_card'
    const raises = isCard ? line.credit : line.debit
    const lowers = isCard ? line.debit : line.credit
    return formatMoney(raises - lowers, currency)
}

// The clear box's label: "Clear Expense 12" / "Unclear Expense 12".
export function clearBoxLabel(typeAndNumber: string, isCleared: boolean): string {
    return `${isCleared ? 'Unclear' : 'Clear'} ${typeAndNumber}`
}

export function emptyLinesText(accountLabel: string, statementDate: string): string {
    return `No transaction on ${accountLabel} up to ${formatDay(statementDate)} waits to be cleared.`
}

// The result line: the last batch result, or a refusal in text-danger.
export type ReconcileResult = { text: string; tone: 'muted' | 'danger' }

export type ReconcileBatchAction = 'clear' | 'unclear'

// The result of a batch (Clear all shown, Clear matched). `messages` holds one message for
// each failure: the server's refusal, or RECONCILE_TEXTS.sendFailed for a transport
// failure. When every failure has the same message, the line reads it.
export function batchResultText(outcome: {
    action: ReconcileBatchAction
    done: number
    failed: number
    messages: readonly string[]
}): string {
    const { action, done, failed, messages } = outcome
    const verb = action === 'clear' ? 'cleared' : 'uncleared'
    if (failed === 0) {
        const past = action === 'clear' ? 'Cleared' : 'Uncleared'
        return `${past} ${countText(done, 'transaction', 'transactions')}.`
    }
    const [first] = messages
    if (first !== undefined && messages.every(message => message === first)) return first
    const total = countText(done + failed, 'transaction', 'transactions')
    return `${failed} of ${total} could not be ${verb}. Try again.`
}

export function startTitleText(accountLabel: string): string {
    return `Reconcile ${accountLabel}`
}

// The start dialog opens a reconciliation ('start') or edits the statement information of
// one in progress ('edit', the work screen's Edit info): the same form, its own title and
// submit label.
export type ReconcileStartMode = 'start' | 'edit'

export function startDialogTexts(
    mode: ReconcileStartMode,
    accountLabel: string
): { title: string; submit: string; sending: string } {
    if (mode === 'edit') {
        return { title: 'Edit statement information', submit: 'Save', sending: 'Saving…' }
    }
    return {
        title: startTitleText(accountLabel),
        submit: 'Start reconciling',
        sending: RECONCILE_TEXTS.starting,
    }
}

// Under the read-only beginning balance of the start dialog.
export function beginningNoteText(lastDate: string): string {
    if (lastDate === '') return RECONCILE_TEXTS.firstNote
    return `From the statement of ${formatDay(lastDate)}`
}

export function statementFileNoteText(fileName: string): string {
    return `From ${fileName}. Check them against your statement.`
}

export function reconciledThroughText(statementDate: string): string {
    return `Reconciled through ${formatDay(statementDate)}`
}

export function inProgressText(statementDate: string): string {
    return `In progress · statement of ${formatDay(statementDate)}`
}

export function statementEndingText(statementDate: string): string {
    return `Statement ending ${formatDay(statementDate)}`
}

export function countText(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`
}

export function balanceWord(difference: number): string {
    return difference === 0 ? RECONCILE_TEXTS.balanced : RECONCILE_TEXTS.notBalanced
}

// A figure of the band: TOO_LARGE_TEXT when a sum cannot be shown exactly.
export function bandMoney(cents: number, totals: ReconcileTotals, currency: string): string {
    return totals.isTooLarge ? TOO_LARGE_TEXT : formatMoney(cents, currency)
}

export function statementSideText(statementCents: number, currency: string): string {
    return `of ${formatMoney(statementCents, currency)} on the statement`
}

// '' when the side agrees with the statement.
export function sideOffText(off: number, currency: string): string {
    if (off === 0) return ''
    if (off > 0) return `${formatMoney(off, currency)} under`
    return `${formatMoney(-off, currency)} over`
}

// The phone's compact bar: "Cleared $4,625.00 of $4,625.00".
export function compactClearedText(
    totals: ReconcileTotals,
    statementBalance: number,
    currency: string
): string {
    const cleared = bandMoney(totals.clearedBalance, totals, currency)
    return `Cleared ${cleared} of ${bandMoney(statementBalance, totals, currency)}`
}

export type ReconcileAccountKeyAction = 'next' | 'previous' | 'open'

// The accounts screen's keys (reconcile spec §3 "Keys"), as tinykeys names them (core
// lib/shortcuts/matcher.ts).
export const RECONCILE_ACCOUNT_KEYS: Record<ReconcileAccountKeyAction, readonly string[]> = {
    next: ['ArrowDown', 'j'],
    previous: ['ArrowUp', 'k'],
    open: ['Enter'],
}

export const RECONCILE_ACCOUNT_KEY_LABELS: Record<ReconcileAccountKeyAction, string> = {
    next: 'Next account',
    previous: 'Previous account',
    open: 'Reconcile, resume or view',
}

// ↵ presses the focused row's action, so it is offered only while a row has the focus.
export function offeredAccountKeyActions(hasFocusedRow: boolean): ReconcileAccountKeyAction[] {
    return hasFocusedRow ? ['next', 'previous', 'open'] : ['next', 'previous']
}
