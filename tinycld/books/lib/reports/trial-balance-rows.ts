import {
    and,
    type Collection,
    caseWhen,
    count,
    eq,
    gte,
    type InitialQueryBuilder,
    isUndefined,
    lte,
    subtract,
    sum,
    type UtilsRecord,
} from '@tanstack/db'
import type { TrialBalanceSourceRow } from '../../hooks/useTrialBalance'
import type { BooksAccountBalances, BooksAccounts, BooksJournalLines } from '../../types'
import { buildAccountTree, defaultSort } from '../account-tree'
import { type AccountGroup, accountTypeDef } from '../account-types'
import { periodOf } from '../register-range'
import type { ReportColumn, ReportModel, ReportModelRow, RowsChoice } from '../report-definition'
import { accountGroupOf } from '../report-filters'
import { asOfSlices, fiscalYearStartOf, previousPeriod } from '../report-period'

// The insert-input parameters are generic because a pbtsdb collection omits server-stamped
// fields on insert while a plain collection does not; the query reads rows only.
type Rows<T extends object, I extends object> = Collection<
    T,
    string | number,
    UtilsRecord,
    never,
    I
>

// Whole months through `through` come from balance rows, the partial month from posted
// lines. Income and expense totals through `priorThrough` belong to earlier fiscal years.
export type TrialBalancePlan = {
    through: string
    priorThrough: string
    edge: { from: string; to: string } | null
}

export function trialBalancePlan(date: string, fiscalStartMonth: number): TrialBalancePlan {
    return {
        ...asOfSlices(date),
        priorThrough: previousPeriod(periodOf(fiscalYearStartOf(date, fiscalStartMonth))),
    }
}

// A bare `null` in a select is typed `unknown`; this keeps the no-edge branch's `edgeNet`
// the same type as the edge branch's.
const NO_EDGE: number | null = null

// Every totals side is aggregated to one row per account, so no left join can duplicate an
// account. A side with no row for an account stays null, which the Rows "Active" rule reads.
export function trialBalanceQuery<AI extends object, BI extends object, LI extends object>(
    collections: {
        accounts: Rows<BooksAccounts, AI>
        balances: Rows<BooksAccountBalances, BI>
        lines: Rows<BooksJournalLines, LI>
    },
    plan: TrialBalancePlan
) {
    const { accounts, balances, lines } = collections
    return (query: InitialQueryBuilder) => {
        const totalsThrough = (period: string) =>
            query
                .from({ balance: balances })
                .where(({ balance }) => lte(balance.period, period))
                .groupBy(({ balance }) => balance.account)
                .select(({ balance }) => ({
                    account: balance.account,
                    net: subtract(sum(balance.debit_total), sum(balance.credit_total)),
                    months: count(balance.id),
                }))
        const withYear = query
            .from({ account: accounts })
            .leftJoin({ through: totalsThrough(plan.through) }, ({ account, through }) =>
                eq(account.id, through.account)
            )
            .leftJoin({ prior: totalsThrough(plan.priorThrough) }, ({ account, prior }) =>
                eq(account.id, prior.account)
            )
        const edge = plan.edge
        if (!edge) {
            return withYear.select(({ account, through, prior }) => ({
                id: account.id,
                number: account.number,
                name: account.name,
                type: account.type,
                detail_type: account.detail_type,
                parent: account.parent,
                inactive: account.inactive,
                throughNet: caseWhen(isUndefined(through), null, through?.net),
                throughMonths: caseWhen(isUndefined(through), null, through?.months),
                priorNet: caseWhen(isUndefined(prior), null, prior?.net),
                priorMonths: caseWhen(isUndefined(prior), null, prior?.months),
                edgeNet: NO_EDGE,
            }))
        }
        const edgeTotals = query
            .from({ line: lines })
            .where(({ line }) =>
                and(eq(line.posted, true), gte(line.date, edge.from), lte(line.date, edge.to))
            )
            .groupBy(({ line }) => line.account)
            .select(({ line }) => ({
                account: line.account,
                net: subtract(sum(line.debit), sum(line.credit)),
            }))
        return withYear
            .leftJoin({ edge: edgeTotals }, ({ account, edge }) => eq(account.id, edge.account))
            .select(({ account, through, prior, edge }) => ({
                id: account.id,
                number: account.number,
                name: account.name,
                type: account.type,
                detail_type: account.detail_type,
                parent: account.parent,
                inactive: account.inactive,
                throughNet: caseWhen(isUndefined(through), null, through?.net),
                throughMonths: caseWhen(isUndefined(through), null, through?.months),
                priorNet: caseWhen(isUndefined(prior), null, prior?.net),
                priorMonths: caseWhen(isUndefined(prior), null, prior?.months),
                edgeNet: caseWhen(isUndefined(edge), null, edge?.net),
            }))
    }
}

export const TRIAL_BALANCE_COLUMNS: ReportColumn[] = [
    { id: 'label', label: 'Account', kind: 'text' },
    { id: 'debit', label: 'Debit', kind: 'money' },
    { id: 'credit', label: 'Credit', kind: 'money' },
]

export const RETAINED_EARNINGS_ROW_ID = 'retained-earnings'
export const TRIAL_BALANCE_TOTAL_ROW_ID = 'total'

type TrialBalanceInput = {
    rows: readonly TrialBalanceSourceRow[]
    rowsChoice: RowsChoice
    filter: readonly string[] | undefined
}

// One candidate row before the rows choice and the filter: the signed debit-positive
// balance and whether the account had a posting in the period.
type Line = {
    id: string
    label: string
    group: AccountGroup | undefined
    balance: number
    hasActivity: boolean
}

const isProfitAndLoss = (group: AccountGroup | undefined) =>
    group === 'income' || group === 'expense'

function chartOrder(rows: readonly TrialBalanceSourceRow[]): TrialBalanceSourceRow[] {
    const byId = new Map(rows.map(row => [row.id, row]))
    const tree = buildAccountTree(
        rows.map(row => ({ ...row, debit_total: 0, credit_total: 0 })),
        defaultSort
    )
    const ordered: TrialBalanceSourceRow[] = []
    const walk = (nodes: typeof tree) => {
        for (const node of nodes) {
            const row = byId.get(node.account.id)
            if (row) ordered.push(row)
            walk(node.children)
        }
    }
    walk(tree)
    return ordered
}

const accountLabel = (row: TrialBalanceSourceRow) => `${row.number} ${row.name}`.trim()

// Income and expense accounts count only this fiscal year; what they carried before it
// is returned as `prior` so it can net into retained earnings. A month count above the
// prior count is in-year activity, even when its debits and credits cancel.
function accountLine(row: TrialBalanceSourceRow): { line: Line; prior: number } {
    const group = accountTypeDef(row.type)?.group
    const yearOnly = isProfitAndLoss(group)
    const prior = yearOnly ? (row.priorNet ?? 0) : 0
    const hasActivity = yearOnly
        ? row.edgeNet !== null || (row.throughMonths ?? 0) > (row.priorMonths ?? 0)
        : row.throughNet !== null || row.edgeNet !== null
    const line = {
        id: row.id,
        label: accountLabel(row),
        group,
        balance: (row.throughNet ?? 0) + (row.edgeNet ?? 0) - prior,
        hasActivity,
    }
    return { line, prior }
}

function syntheticRetainedLine(balance: number): Line {
    return {
        id: RETAINED_EARNINGS_ROW_ID,
        label: 'Retained earnings',
        group: 'equity',
        balance,
        hasActivity: false,
    }
}

// The netted prior-year amount goes to the first retained-earnings account in chart order,
// or, without one, to a synthetic row right after the last equity account.
function withRetainedEarnings(
    lines: Line[],
    ordered: readonly TrialBalanceSourceRow[],
    retainedDelta: number
): Line[] {
    const target = ordered.find(row => row.detail_type === 'retained_earnings')
    if (target) {
        return lines.map(line =>
            line.id === target.id ? { ...line, balance: line.balance + retainedDelta } : line
        )
    }
    const lastEquity = lines.findLastIndex(line => line.group === 'equity')
    const at = lastEquity === -1 ? lines.length : lastEquity + 1
    return [...lines.slice(0, at), syntheticRetainedLine(retainedDelta), ...lines.slice(at)]
}

function keepsForRows(line: Line, rows: RowsChoice): boolean {
    if (line.id === RETAINED_EARNINGS_ROW_ID) return line.balance !== 0
    if (rows === 'all') return true
    if (rows === 'active') return line.balance !== 0 || line.hasActivity
    return line.balance !== 0
}

function keepsForFilter(line: Line, filter: readonly string[] | undefined): boolean {
    if (filter === undefined || filter.length === 0) return true
    return filter.some(value => value === line.id || accountGroupOf(value) === line.group)
}

function detailRow(line: Line): ReportModelRow {
    return {
        id: line.id,
        kind: 'detail',
        depth: 0,
        label: line.label,
        cells: {
            debit: line.balance > 0 ? line.balance : null,
            credit: line.balance < 0 ? -line.balance : null,
        },
    }
}

function totalRow(lines: readonly Line[]): ReportModelRow {
    let debit = 0
    let credit = 0
    for (const line of lines) {
        if (line.balance > 0) debit += line.balance
        if (line.balance < 0) credit -= line.balance
    }
    return {
        id: TRIAL_BALANCE_TOTAL_ROW_ID,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { debit, credit },
    }
}

export function buildTrialBalance(input: TrialBalanceInput): ReportModel {
    const ordered = chartOrder(input.rows)
    let retainedDelta = 0
    const lines = ordered.map(row => {
        const { line, prior } = accountLine(row)
        retainedDelta += prior
        return line
    })
    const shown = withRetainedEarnings(lines, ordered, retainedDelta).filter(
        line => keepsForRows(line, input.rowsChoice) && keepsForFilter(line, input.filter)
    )
    return { columns: TRIAL_BALANCE_COLUMNS, rows: [...shown.map(detailRow), totalRow(shown)] }
}
