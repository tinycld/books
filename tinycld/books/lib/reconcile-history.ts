import type { BooksAccounts, BooksReconciliations } from '../types'
import { accountLabel } from './account-options'
import { compareNumbers, compareText } from './account-tree'
import { localDayOf } from './opening-balances'
import { countText } from './reconcile'
import { formatDay } from './register-range'

// The pure parts of the Reconcile History tab (reconciliation report spec §3 "The history",
// §4 "Reads" and "Client modules"). The rows are the history query's: a finished
// reconciliation with its account (`accountRow`, the query's materialize()). The latest row
// of each account, the filter's account list, the rows under the filter and the shown order
// are all computed here from that one query, so the filter sends no request.

type HistoryAccount = Pick<BooksAccounts, 'id' | 'name' | 'number'>

type HistoryRowPart = Pick<BooksReconciliations, 'id' | 'account' | 'statement_date'> & {
    accountRow: HistoryAccount
}

type ClearedPart = Pick<BooksReconciliations, 'cleared_out_count' | 'cleared_in_count'>

type ReconciledPart = Pick<BooksReconciliations, 'finished_at' | 'finished_by_name'>

export type HistorySort = 'descending' | 'ascending'

export type HistoryState = 'loading' | 'error' | 'empty' | 'empty-filtered' | 'rows'

export type HistoryMenuItem = 'report' | 'undo'

export type HistoryKeyAction = 'next' | 'previous' | 'open' | 'report'

export type ReconcileTab = 'accounts' | 'history'

// The cells of the history table, shared by its header and its rows. The spec's minimums
// do not fit the 908 px a 1280 px window leaves the list, and at 130 the header "Statement
// ending" is cut, so these are the measured widths (the ledger's Design note 2).
export const HISTORY_CELLS = {
    date: { width: 164 },
    account: { flex: 2, minWidth: 166 },
    balance: { width: 122 },
    cleared: { width: 112 },
    reconciled: { flex: 1, minWidth: 178 },
    action: { width: 124 },
} as const

// 164 + 166 + 122 + 112 + 178 + 124, and the row's padding (pl-4 pr-2).
export const HISTORY_MIN_WIDTH = 890
export const HISTORY_ROW_HEIGHT = 44
export const HISTORY_CARD_HEIGHT = 76
export const HISTORY_ROW_CLASS =
    'flex-row items-center pl-4 pr-2 border-b border-border bg-background'
export const HISTORY_HEADER_CLASS = 'flex-row items-center pl-4 pr-2'

export const RECONCILE_TABS: readonly { key: ReconcileTab; label: string }[] = [
    { key: 'accounts', label: 'Accounts' },
    { key: 'history', label: 'History' },
]

export const HISTORY_TEXTS = {
    line: 'Finished reconciliations, newest first.',
    accountPurpose: 'Account',
    allAccounts: 'All accounts',
    clearFilter: 'Clear filter',
    loadError: 'Books could not load the reconciliations.',
    retry: 'Retry',
    empty: 'No reconciliation is finished yet. A finished reconciliation shows here with its report.',
    emptyFiltered: (accountName: string) => `${accountName} has no finished reconciliation.`,
    goToAccounts: 'Go to Accounts',
    viewReport: 'View report',
    undo: 'Undo reconciliation',
    statementEnding: 'Statement ending',
    account: 'Account',
    endingBalance: 'Ending balance',
    cleared: 'Cleared',
    reconciled: 'Reconciled',
    historyLink: (accountName: string) => `All reconciliations of ${accountName}`,
} as const

// The history's keys (spec §3 "Keys"), as tinykeys names them (core
// lib/shortcuts/matcher.ts).
export const HISTORY_KEYS: Record<HistoryKeyAction, readonly string[]> = {
    next: ['ArrowDown', 'j'],
    previous: ['ArrowUp', 'k'],
    open: ['Enter', 'o'],
    report: ['r'],
}

export const HISTORY_KEY_LABELS: Record<HistoryKeyAction, string> = {
    next: 'Next reconciliation',
    previous: 'Previous reconciliation',
    open: 'Open the finished summary',
    report: 'View report',
}

// ↵ / O need a focused row; R needs a focused row and the report.
export function offeredHistoryKeyActions(input: {
    hasRows: boolean
    hasFocusedRow: boolean
    hasReport: boolean
}): HistoryKeyAction[] {
    if (!input.hasRows) return []
    const actions: HistoryKeyAction[] = ['next', 'previous']
    if (!input.hasFocusedRow) return actions
    actions.push('open')
    if (input.hasReport) actions.push('report')
    return actions
}

// Chart order: number-less accounts last, numbers numerically, then the name, then the id
// (the compares of lib/account-tree.ts, as the accounts screen orders its rows).
function compareAccounts(a: HistoryAccount, b: HistoryAccount): number {
    const aBlank = a.number === ''
    const bBlank = b.number === ''
    if (aBlank !== bBlank) return aBlank ? 1 : -1
    return (
        compareNumbers(a.number, b.number) ||
        compareText(a.name, b.name) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
}

// The latest finished reconciliation of each account (the one with the latest statement
// date): the only one an admin can undo.
export function latestFinishedIds(rows: readonly HistoryRowPart[]): Set<string> {
    const latest = new Map<string, HistoryRowPart>()
    for (const row of rows) {
        const current = latest.get(row.account)
        if (!current || row.statement_date > current.statement_date) latest.set(row.account, row)
    }
    return new Set([...latest.values()].map(row => row.id))
}

// The Account filter's accounts: each account that has a row, once, in chart order,
// labelled "<number> <name>".
export function historyAccounts(rows: readonly HistoryRowPart[]): { id: string; label: string }[] {
    const accounts = new Map<string, HistoryAccount>()
    for (const row of rows) {
        if (!accounts.has(row.account)) accounts.set(row.account, row.accountRow)
    }
    return [...accounts.values()]
        .sort(compareAccounts)
        .map(account => ({ id: account.id, label: accountLabel(account) }))
}

// The rows under the Account filter ('' for every account), ordered by statement date in
// `sort`'s direction, then by account in chart order inside a date.
export function shownHistory<Row extends HistoryRowPart>(
    rows: readonly Row[],
    accountId: string,
    sort: HistorySort
): Row[] {
    const direction = sort === 'descending' ? -1 : 1
    const picked = accountId === '' ? [...rows] : rows.filter(row => row.account === accountId)
    return picked.sort((a, b) => {
        if (a.statement_date !== b.statement_date) {
            return a.statement_date < b.statement_date ? -direction : direction
        }
        return compareAccounts(a.accountRow, b.accountRow)
    })
}

// "4 transactions": the cleared transactions of both sides.
export function clearedCountText(row: ClearedPart): string {
    return countText(row.cleared_out_count + row.cleared_in_count, 'transaction', 'transactions')
}

function reconciledDay(row: ReconciledPart): string {
    const day = localDayOf(row.finished_at)
    return day === '' ? '' : formatDay(day)
}

// The table's Reconciled cell: "Nov 21, 2026 · Ana Ruiz", or only the day with no name.
export function reconciledByText(row: ReconciledPart): string {
    const day = reconciledDay(row)
    if (row.finished_by_name === '') return day
    return `${day} · ${row.finished_by_name}`
}

// The card's third line: "Reconciled Nov 21, 2026 by Ana Ruiz", or with no name only the day.
export function reconciledCardText(row: ReconciledPart): string {
    const when = `Reconciled ${reconciledDay(row)}`
    if (row.finished_by_name === '') return when
    return `${when} by ${row.finished_by_name}`
}

// The history's body: loading until every read has answered, the error when one failed
// (also while another still loads), the empty states, else the rows.
export function historyState(input: {
    isLoading: boolean
    isError: boolean
    all: readonly unknown[]
    shown: readonly unknown[]
    accountId: string
}): HistoryState {
    if (input.isError) return 'error'
    if (input.isLoading) return 'loading'
    if (input.all.length === 0) return 'empty'
    if (input.accountId !== '' && input.shown.length === 0) return 'empty-filtered'
    return 'rows'
}

// A row's menu: View report always; Undo reconciliation only when `canUndo` (a Books admin,
// on the latest finished reconciliation of its account).
export function historyMenuItems(
    row: Pick<BooksReconciliations, 'status'>,
    canUndo: boolean
): HistoryMenuItem[] {
    return canUndo && row.status === 'finished' ? ['report', 'undo'] : ['report']
}
