// The figures of the dashboard widgets (spec docs/specs/dashboard-design.md §3), summed
// in integer cents from the rows of their live reads.

import type { AccountRow } from '../hooks/useAccountsQuery'
import type { BankConnectionRow } from '../hooks/useBankConnections'
import type { BalanceRow } from '../hooks/useDashboardBalances'
import type { BooksInvoiceDueTotals, BooksPaymentDayTotals } from '../types'
import { accountLabel } from './account-options'
import {
    addExact,
    buildAccountTree,
    compareText,
    defaultSort,
    ownBalance,
    type TreeNode,
} from './account-tree'
import { type MonthRange, monthLabels, yearBefore } from './dashboard-periods'
import type { PeriodId, SalesPeriodId } from './dashboard-prefs'
import { addDays } from './document-dates'
import { amountText, formatMoney, TOO_LARGE_TEXT } from './money'
import { monthStartOf } from './register-range'

// With Hide amounts on, every money figure is this fixed text, whatever the amount.
export const MASK = '•••••'
export const MASKED_PERCENT = '••%'

// Every dashboard amount: zero draws as the currency's zero (a figure that leads a card
// is never blank), and an amount Books cannot hold exactly (null) as TOO_LARGE_TEXT.
export function dashboardAmount(cents: number | null, currency: string, hideAmounts: boolean) {
    if (hideAmounts) return MASK
    if (cents === null) return TOO_LARGE_TEXT
    return amountText(cents, currency) || formatMoney(0, currency)
}

// The tone of a dashboard amount: an amount Books cannot hold exactly (null) draws in the
// danger tone, except under the mask, whose look must not tell anything about the amount.
export function dashboardTone(cents: number | null, hideAmounts: boolean): 'normal' | 'danger' {
    return cents === null && !hideAmounts ? 'danger' : 'normal'
}

export function dashboardPercent(percent: number, hideAmounts: boolean) {
    return hideAmounts ? MASKED_PERCENT : `${percent}%`
}

export type Loadable<T> =
    | { status: 'ready'; model: T }
    | { status: 'loading' }
    | { status: 'error' }

// Every amount of a model is in integer cents.
export interface InvoicesModel {
    isEmpty: boolean
    unpaid: number
    overdue: number
    notDue: number
    overdueCount: number
    paidLast30Days: number
    // The balance of the Undeposited funds accounts; the line shows only when not zero.
    // Null when Books cannot hold it exactly.
    waitingToDeposit: number | null
}

// The first day of "Paid, last 30 days": today and the 29 days before it. A day that is
// not an ISO day has no window before it, so the window is today alone.
export function paidWindowStart(today: string): string {
    return addDays(today, -29) ?? today
}

export function invoicesModel(input: {
    dueTotals: readonly Pick<BooksInvoiceDueTotals, 'due_date' | 'balance' | 'count'>[]
    paymentTotals: readonly Pick<BooksPaymentDayTotals, 'date' | 'amount'>[]
    undepositedCents: number | null
    today: string
}): InvoicesModel {
    const { dueTotals, paymentTotals, undepositedCents, today } = input
    let overdue = 0
    let notDue = 0
    let overdueCount = 0
    for (const row of dueTotals) {
        if (row.due_date < today) {
            overdue += row.balance
            overdueCount += row.count
        } else {
            notDue += row.balance
        }
    }
    const windowStart = paidWindowStart(today)
    const paidRows = paymentTotals.filter(row => row.date >= windowStart && row.date <= today)
    const paidLast30Days = paidRows.reduce((sum, row) => sum + row.amount, 0)
    return {
        // The view holds only invoices with an open balance, so no row is nothing unpaid.
        isEmpty: dueTotals.length === 0 && paidRows.length === 0,
        unpaid: overdue + notDue,
        overdue,
        notDue,
        overdueCount,
        paidLast30Days,
        waitingToDeposit: undepositedCents,
    }
}

// The balance of the active Undeposited funds accounts; null when one balance, or the
// sum, is past the range where a number holds every cent.
export function undepositedBalance(accounts: readonly AccountRow[]): number | null {
    let total: number | null = 0
    for (const account of accounts) {
        if (account.inactive || account.detail_type !== 'undeposited_funds') continue
        total = addExact(total, ownBalance(account.type, account.debit_total, account.credit_total))
    }
    return total
}

export interface ExpenseRow {
    key: string
    label: string
    amount: number
    // The row's amount against the largest row, 0 to 1: the bar's length.
    share: number
    isEverythingElse: boolean
}

export interface ExpensesModel {
    isEmpty: boolean
    period: PeriodId
    total: number
    rows: ExpenseRow[]
}

export interface BankRow {
    accountId: string
    label: string
    // Null when Books cannot hold the balance exactly.
    balance: number | null
    // Null for an account with no bank connection.
    connectionId: string | null
    reviewCount: number
}

export interface BankAccountsModel {
    isEmpty: boolean
    // At most BANK_ROW_LIMIT rows.
    rows: BankRow[]
    moreCount: number
}

export interface ProfitAndLossModel {
    isEmpty: boolean
    period: PeriodId
    netProfit: number
    income: number
    expenses: number
    // Null when the same period one year earlier has no figure (plan D10).
    change: { direction: 'up' | 'down'; percent: number } | null
}

export interface SalesMonth {
    // The month's first day.
    month: string
    shortLabel: string
    longLabel: string
    amount: number
}

export interface SalesModel {
    isEmpty: boolean
    period: SalesPeriodId
    total: number
    months: SalesMonth[]
}

const EXPENSE_TYPES: readonly BalanceRow['type'][] = [
    'cost_of_goods_sold',
    'expense',
    'other_expense',
]
const INCOME_TYPES: readonly BalanceRow['type'][] = ['income', 'other_income']
// Other income is not sales.
const SALES_TYPES: readonly BalanceRow['type'][] = ['income']

const EXPENSE_ROW_LIMIT = 4
const EVERYTHING_ELSE_KEY = 'rest'
const EVERYTHING_ELSE_LABEL = 'Everything else'

// The rows of the given types whose month is one of the range's months.
function rowsIn(
    rows: readonly BalanceRow[],
    types: readonly BalanceRow['type'][],
    range: MonthRange
): BalanceRow[] {
    const months = new Set(range.months)
    return rows.filter(row => types.includes(row.type) && months.has(row.month_start.slice(0, 10)))
}

function netDebit(rows: readonly BalanceRow[]): number {
    return rows.reduce((sum, row) => sum + row.debit_total - row.credit_total, 0)
}

function netCredit(rows: readonly BalanceRow[]): number {
    return rows.reduce((sum, row) => sum + row.credit_total - row.debit_total, 0)
}

type AccountFacts = Pick<BalanceRow, 'account' | 'parent' | 'name' | 'number'>

export type ChartAccount = Pick<AccountRow, 'id' | 'parent' | 'name' | 'number'>

// The accounts a roll-up walks: the chart's list when given (so a header account with no
// balance row is still the top level), else the accounts the rows name.
function accountFactsOf(
    rows: readonly BalanceRow[],
    chart: readonly ChartAccount[] | undefined
): Map<string, AccountFacts> {
    const facts = new Map<string, AccountFacts>(rows.map(row => [row.account, row]))
    for (const account of chart ?? []) {
        facts.set(account.id, {
            account: account.id,
            parent: account.parent,
            name: account.name,
            number: account.number,
        })
    }
    return facts
}

// The top-level account of `start`: `parent` walked to the account with no parent among
// `accounts`. The seen-set stops a parent chain that loops.
function topLevelOf(
    start: AccountFacts,
    accounts: ReadonlyMap<string, AccountFacts>
): AccountFacts {
    const seen = new Set<string>([start.account])
    let current = start
    while (current.parent !== '' && !seen.has(current.parent)) {
        const parent = accounts.get(current.parent)
        if (!parent) break
        seen.add(parent.account)
        current = parent
    }
    return current
}

type RankedAmount = { key: string; label: string; amount: number }

function rankDescending(a: RankedAmount, b: RankedAmount): number {
    return b.amount - a.amount || compareText(a.label, b.label)
}

// The four largest top-level accounts by amount, and "Everything else" with the rest and
// every account with a net credit; an account whose amount is 0 is in no row.
function expenseRows(amounts: readonly RankedAmount[]): ExpenseRow[] {
    const positive = amounts.filter(item => item.amount > 0).sort(rankDescending)
    const shown = positive.slice(0, EXPENSE_ROW_LIMIT)
    const rest = [...positive.slice(EXPENSE_ROW_LIMIT), ...amounts.filter(item => item.amount < 0)]
    const largest = shown[0]?.amount ?? 0
    // "Everything else" can sum above the largest row; its bar is then full width.
    const shareOf = (amount: number) =>
        amount > 0 && largest > 0 ? Math.min(1, amount / largest) : 0
    const rows: ExpenseRow[] = shown.map(item => ({
        ...item,
        share: shareOf(item.amount),
        isEverythingElse: false,
    }))
    if (rest.length === 0) return rows
    const restAmount = rest.reduce((sum, item) => sum + item.amount, 0)
    rows.push({
        key: EVERYTHING_ELSE_KEY,
        label: EVERYTHING_ELSE_LABEL,
        amount: restAmount,
        share: shareOf(restAmount),
        isEverythingElse: true,
    })
    return rows
}

// "Total expenses" is the net debit of the expense-side accounts in the period; the rows
// rank the top-level accounts, a sub-account counted toward its top-level parent. With
// `accounts` (every account of the book), the parent walk reads that list.
export function expensesModel(
    rows: readonly BalanceRow[],
    period: PeriodId,
    range: MonthRange,
    accounts?: readonly ChartAccount[]
): ExpensesModel {
    const inRange = rowsIn(rows, EXPENSE_TYPES, range)
    const facts = accountFactsOf(rows, accounts)
    const byTop = new Map<string, RankedAmount>()
    for (const row of inRange) {
        const top = topLevelOf(facts.get(row.account) ?? row, facts)
        const item = byTop.get(top.account) ?? {
            key: top.account,
            label: accountLabel(top),
            amount: 0,
        }
        item.amount += row.debit_total - row.credit_total
        byTop.set(top.account, item)
    }
    return {
        isEmpty: inRange.length === 0,
        period,
        total: netDebit(inRange),
        rows: expenseRows([...byTop.values()]),
    }
}

function netProfitOf(rows: readonly BalanceRow[], range: MonthRange) {
    const incomeRows = rowsIn(rows, INCOME_TYPES, range)
    const expenseRowsInRange = rowsIn(rows, EXPENSE_TYPES, range)
    const income = netCredit(incomeRows)
    const expenses = netDebit(expenseRowsInRange)
    return {
        hasRows: incomeRows.length > 0 || expenseRowsInRange.length > 0,
        income,
        expenses,
        netProfit: income - expenses,
    }
}

// Income minus expenses on the accrual basis, against the same months one year earlier.
// The change is null when the earlier net profit is zero, which holds when that period
// has no income and no expense (plan D10).
export function profitAndLossModel(
    rows: readonly BalanceRow[],
    period: PeriodId,
    range: MonthRange
): ProfitAndLossModel {
    const now = netProfitOf(rows, range)
    const before = netProfitOf(rows, yearBefore(range)).netProfit
    const change: ProfitAndLossModel['change'] =
        before === 0
            ? null
            : {
                  direction: now.netProfit < before ? 'down' : 'up',
                  percent: Math.round((Math.abs(now.netProfit - before) / Math.abs(before)) * 100),
              }
    return {
        isEmpty: !now.hasRows,
        period,
        netProfit: now.netProfit,
        income: now.income,
        expenses: now.expenses,
        change,
    }
}

// The lengths of two bars: the longer is 1 and the other its amount over the longer; a
// zero or negative amount is 0.
export function barShares(first: number, second: number): [number, number] {
    const a = Math.max(first, 0)
    const b = Math.max(second, 0)
    const longer = Math.max(a, b)
    if (longer === 0) return [0, 0]
    return [a / longer, b / longer]
}

// One month per month of the range, in order, each the net credit of the Income accounts
// (a month with no row is 0; a month with more debit than credit is negative). Future
// months of the range are kept, so a fiscal year draws all its columns (plan D9).
export function salesModel(
    rows: readonly BalanceRow[],
    period: SalesPeriodId,
    range: MonthRange,
    _today: string
): SalesModel {
    const inRange = rowsIn(rows, SALES_TYPES, range)
    const months = range.months.map(month => ({
        month,
        ...monthLabels(month),
        amount: netCredit(inRange.filter(row => row.month_start.slice(0, 10) === month)),
    }))
    const total = months.reduce((sum, month) => sum + month.amount, 0)
    return {
        isEmpty: inRange.length === 0 && months.every(month => month.amount === 0),
        period,
        total,
        months,
    }
}

// The month the picked line shows when no column is picked: the last month that is not
// after today's month (plan D9).
export function latestShownMonth(
    months: readonly SalesMonth[],
    today: string
): SalesMonth | undefined {
    const thisMonth = monthStartOf(today)
    const shown = months.filter(month => month.month <= thisMonth)
    return shown[shown.length - 1]
}

export const BANK_ROW_LIMIT = 6

const BANK_TYPES: readonly string[] = ['bank', 'credit_card']

// The accounts of the tree, each parent before its sub-accounts: chart order.
function inChartOrder<T extends AccountRow>(nodes: readonly TreeNode<T>[]): TreeNode<T>[] {
    return nodes.flatMap(node => [node, ...inChartOrder(node.children)])
}

// One row per active Bank or Credit card account in chart order, with its balance in the
// books (no bank-reported figure: Books has none) and, when connected, its connection and
// its count of transactions for review.
export function bankAccountsModel(
    accounts: readonly AccountRow[],
    connections: readonly BankConnectionRow[]
): BankAccountsModel {
    const shownAccounts = accounts.filter(
        account => !account.inactive && BANK_TYPES.includes(account.type)
    )
    const ordered = inChartOrder(buildAccountTree(shownAccounts, defaultSort))
    const rows: BankRow[] = ordered.slice(0, BANK_ROW_LIMIT).map(node => {
        const connection = connections.find(row => row.account === node.account.id)
        return {
            accountId: node.account.id,
            label: accountLabel(node.account),
            balance: node.ownBalance,
            connectionId: connection?.id ?? null,
            reviewCount: connection?.reviewCount ?? 0,
        }
    })
    return {
        isEmpty: ordered.length === 0,
        rows,
        moreCount: ordered.length - rows.length,
    }
}
