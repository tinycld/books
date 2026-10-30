import { describe, expect, it } from 'vitest'
import type { TrialBalanceSourceRow } from '../tinycld/books/hooks/useTrialBalance'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import { maxStoredAmount } from '../tinycld/books/lib/money'
import {
    DEFAULT_NUMBER_FORMAT,
    type ReportModel,
    type ReportModelRow,
    type RowsChoice,
} from '../tinycld/books/lib/report-definition'
import { formatReportAmount, REPORT_AMOUNT_ERROR } from '../tinycld/books/lib/report-format'
import { REPORT_ACCOUNTS } from '../tinycld/books/lib/report-shell-fixture'
import {
    buildTrialBalance,
    RETAINED_EARNINGS_ROW_ID,
    TRIAL_BALANCE_COLUMNS,
    TRIAL_BALANCE_TOTAL_ROW_ID,
    trialBalancePlan,
} from '../tinycld/books/lib/reports/trial-balance-rows'
import type { BooksAccounts } from '../tinycld/books/types'
import { publishedRow } from './live-rows'

const BANK = 'rpt_acct_1010'
const EQUITY = 'rpt_acct_3000'
const RETAINED = 'rpt_acct_3900'
const INCOME = 'rpt_acct_4000'
const RENT = 'rpt_acct_6000'

// One account's totals row of one kind, as the report query reads it: the debit-positive
// net and the number of balance rows (months) it sums.
type Totals = { net: number; months: number }
type TotalsByAccount = Record<string, Totals>

function totals(debit: number, credit: number, months = 1): Totals {
    return { net: debit - credit, months }
}

// Cumulative through the last whole month. The income was all earned before the fiscal
// year, so it is in the prior totals too; the rent is in the year.
const THROUGH: TotalsByAccount = {
    [BANK]: totals(80_000, 20_000),
    [INCOME]: totals(0, 50_000),
    [RENT]: totals(20_000, 0),
    [EQUITY]: totals(0, 30_000),
}

const PRIOR: TotalsByAccount = { [INCOME]: totals(0, 50_000) }

// The rows the report query returns: one per account, its fields plus each kind of totals,
// null where the account has no totals row of that kind.
function sourceRows(
    accounts: readonly BooksAccounts[],
    kinds: { through: TotalsByAccount; prior: TotalsByAccount; edge: TotalsByAccount }
): TrialBalanceSourceRow[] {
    return accounts.map(account => {
        const through = kinds.through[account.id]
        const prior = kinds.prior[account.id]
        const edge = kinds.edge[account.id]
        return publishedRow(
            {
                id: account.id,
                number: account.number,
                name: account.name,
                type: account.type,
                detail_type: account.detail_type,
                parent: account.parent,
                inactive: account.inactive,
                throughNet: through ? through.net : null,
                throughMonths: through ? through.months : null,
                priorNet: prior ? prior.net : null,
                priorMonths: prior ? prior.months : null,
                edgeNet: edge ? edge.net : null,
            },
            'books_accounts'
        )
    })
}

function build(
    input: {
        accounts?: readonly BooksAccounts[]
        through?: TotalsByAccount
        prior?: TotalsByAccount
        edge?: TotalsByAccount
        rows?: RowsChoice
        filter?: readonly string[]
    } = {}
): ReportModel {
    return buildTrialBalance({
        rows: sourceRows(input.accounts ?? REPORT_ACCOUNTS, {
            through: input.through ?? THROUGH,
            prior: input.prior ?? PRIOR,
            edge: input.edge ?? {},
        }),
        rowsChoice: input.rows ?? 'non-zero',
        filter: input.filter,
    })
}

type Figure = { label: string; debit: unknown; credit: unknown }

function figure(row: ReportModelRow): Figure {
    return { label: row.label, debit: row.cells.debit, credit: row.cells.credit }
}

function details(model: ReportModel) {
    return model.rows.filter(row => row.kind !== 'total')
}

function detailFigures(model: ReportModel): Figure[] {
    return details(model).map(figure)
}

function labels(model: ReportModel): string[] {
    return details(model).map(row => row.label)
}

function totalRow(model: ReportModel): ReportModelRow | undefined {
    return model.rows.find(row => row.id === TRIAL_BALANCE_TOTAL_ROW_ID)
}

function totalCells(model: ReportModel) {
    return totalRow(model)?.cells
}

const label = (account: BooksAccounts) => `${account.number} ${account.name}`

const WITHOUT_RETAINED_ACCOUNT = REPORT_ACCOUNTS.filter(a => a.id !== RETAINED)

const WITHOUT_EQUITY = REPORT_ACCOUNTS.filter(a => accountTypeDef(a.type)?.group !== 'equity')

function testAccount(
    id: string,
    number: string,
    name: string,
    type: BooksAccounts['type'],
    detail_type: string,
    extra: Partial<BooksAccounts> = {}
): BooksAccounts {
    return {
        id,
        number,
        name,
        type,
        detail_type,
        description: '',
        inactive: false,
        currency: 'USD',
        parent: '',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...extra,
    }
}

describe('trialBalancePlan', () => {
    it('reads a month-end date from balance rows only', () => {
        expect(trialBalancePlan('2026-09-30', 1)).toEqual({
            through: '2026-09',
            priorThrough: '2025-12',
            edge: null,
        })
    })

    it('reads the partial month of a mid-month date from lines', () => {
        expect(trialBalancePlan('2026-10-25', 1)).toEqual({
            through: '2026-09',
            priorThrough: '2025-12',
            edge: { from: '2026-10-01', to: '2026-10-25' },
        })
    })

    it('cuts the prior year at the month before the fiscal year start', () => {
        expect(trialBalancePlan('2026-09-30', 7).priorThrough).toBe('2026-06')
    })

    it('reads a date early in the first fiscal month from lines, with no year activity in balance rows', () => {
        expect(trialBalancePlan('2026-07-10', 7)).toEqual({
            through: '2026-06',
            priorThrough: '2026-06',
            edge: { from: '2026-07-01', to: '2026-07-10' },
        })
    })
})

describe('buildTrialBalance figures', () => {
    it('shows each non-zero balance on its own side in chart order and nets prior-year income into retained earnings', () => {
        const model = build()
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
            { label: "3000 Owner's investment", debit: null, credit: 30_000 },
            { label: '3900 Retained earnings', debit: null, credit: 50_000 },
            { label: '6000 Rent', debit: 20_000, credit: null },
        ])
        expect(labels(model)).not.toContain('4000 Consulting income')
        expect(totalRow(model)).toEqual({
            id: TRIAL_BALANCE_TOTAL_ROW_ID,
            kind: 'total',
            depth: 0,
            label: 'Total',
            cells: { debit: 80_000, credit: 80_000 },
        })
        expect(model.rows.at(-1)?.id).toBe(TRIAL_BALANCE_TOTAL_ROW_ID)
        for (const row of details(model)) {
            expect(row.kind).toBe('detail')
            expect(row.depth).toBe(0)
            const amounts = [row.cells.debit, row.cells.credit].filter(cell => cell !== null)
            expect(amounts).toHaveLength(1)
            expect(typeof amounts[0]).toBe('number')
        }
        const byLabel = new Map(REPORT_ACCOUNTS.map(a => [label(a), a]))
        for (const row of details(model)) expect(byLabel.has(row.label)).toBe(true)
    })

    it('has the Account, Debit and Credit columns', () => {
        const columns = [
            { id: 'label', label: 'Account', kind: 'text' },
            { id: 'debit', label: 'Debit', kind: 'money' },
            { id: 'credit', label: 'Credit', kind: 'money' },
        ]
        expect(TRIAL_BALANCE_COLUMNS).toEqual(columns)
        expect(build().columns).toEqual(columns)
    })

    it('adds the edge totals to the through totals', () => {
        const model = build({ edge: { [INCOME]: totals(0, 30_000), [BANK]: totals(30_000, 0) } })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 90_000, credit: null },
            { label: "3000 Owner's investment", debit: null, credit: 30_000 },
            { label: '3900 Retained earnings', debit: null, credit: 50_000 },
            { label: '4000 Consulting income', debit: null, credit: 30_000 },
            { label: '6000 Rent', debit: 20_000, credit: null },
        ])
        expect(totalCells(model)).toEqual({ debit: 110_000, credit: 110_000 })
    })

    it('nets a prior-year expense against prior-year income in retained earnings', () => {
        const model = build({
            prior: { [RENT]: totals(20_000, 0), [INCOME]: totals(0, 50_000) },
        })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
            { label: "3000 Owner's investment", debit: null, credit: 30_000 },
            { label: '3900 Retained earnings', debit: null, credit: 30_000 },
        ])
        expect(totalCells(model)).toEqual({ debit: 60_000, credit: 60_000 })
    })
})

describe('buildTrialBalance retained earnings without an account', () => {
    it('puts the netted amount in a synthetic row right after the last equity account', () => {
        const model = build({ accounts: WITHOUT_RETAINED_ACCOUNT })
        const synthetic = model.rows.find(row => row.id === RETAINED_EARNINGS_ROW_ID)
        expect(RETAINED_EARNINGS_ROW_ID).toBe('retained-earnings')
        expect(synthetic).toEqual({
            id: 'retained-earnings',
            kind: 'detail',
            depth: 0,
            label: 'Retained earnings',
            cells: { debit: null, credit: 50_000 },
        })
        expect(labels(model)).toEqual([
            '1010 Operating checking',
            "3000 Owner's investment",
            'Retained earnings',
            '6000 Rent',
        ])
        expect(totalCells(model)).toEqual({ debit: 80_000, credit: 80_000 })
    })

    it('has no synthetic row under Non-zero when there is no prior-year activity', () => {
        const model = build({
            accounts: WITHOUT_RETAINED_ACCOUNT,
            through: { [BANK]: totals(80_000, 20_000), [EQUITY]: totals(0, 60_000) },
            prior: {},
        })
        expect(model.rows.find(row => row.id === RETAINED_EARNINGS_ROW_ID)).toBeUndefined()
        expect(labels(model)).toEqual(['1010 Operating checking', "3000 Owner's investment"])
    })

    it('puts the synthetic row last when there is no equity account at all', () => {
        const model = build({ accounts: WITHOUT_EQUITY })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
            { label: '6000 Rent', debit: 20_000, credit: null },
            { label: 'Retained earnings', debit: null, credit: 50_000 },
        ])
        expect(details(model).at(-1)?.id).toBe(RETAINED_EARNINGS_ROW_ID)
        expect(totalCells(model)).toEqual({ debit: 80_000, credit: 50_000 })
    })

    it('has no synthetic row under All when the prior-year activity nets to zero', () => {
        // Prior-year income and expense cancel, so the retained-earnings delta is zero.
        const model = build({
            accounts: WITHOUT_RETAINED_ACCOUNT,
            through: {
                [BANK]: totals(20_000, 0),
                [INCOME]: totals(0, 20_000),
                [RENT]: totals(20_000, 0),
                [EQUITY]: totals(0, 20_000),
            },
            prior: { [INCOME]: totals(0, 20_000), [RENT]: totals(20_000, 0) },
            rows: 'all',
        })
        expect(model.rows.find(row => row.id === RETAINED_EARNINGS_ROW_ID)).toBeUndefined()
        expect(labels(model)).toEqual(WITHOUT_RETAINED_ACCOUNT.map(label))
        expect(totalCells(model)).toEqual({ debit: 20_000, credit: 20_000 })
    })

    it('has no synthetic row when a retained earnings account exists', () => {
        const model = build()
        expect(model.rows.find(row => row.id === RETAINED_EARNINGS_ROW_ID)).toBeUndefined()
    })
})

describe('buildTrialBalance rows choice', () => {
    it('All lists every account, a zero balance with both cells empty and an inactive account', () => {
        const accounts = REPORT_ACCOUNTS.map(a =>
            a.id === 'rpt_acct_6300' ? { ...a, inactive: true } : a
        )
        const model = build({ accounts, rows: 'all' })
        expect(labels(model)).toEqual(REPORT_ACCOUNTS.map(label))
        const charitable = details(model).find(row => row.label === '6900 Charitable contributions')
        expect(charitable?.cells).toEqual({ debit: null, credit: null })
        expect(labels(model)).toContain('6300 Bank charges')
        expect(totalCells(model)).toEqual({ debit: 80_000, credit: 80_000 })
    })

    // 1010 has a balance. 1020 (asset) and 2100 (liability) have postings that cancel.
    // 4000's activity is all before the fiscal year. 6100's in-year debits and credits
    // cancel. 4100 has a cancelling edge posting. 6200's activity is all prior-year.
    // 3900 has no postings but receives the netted prior-year amount. Every other
    // account has no totals row.
    const ACTIVITY = {
        through: {
            [BANK]: totals(80_000, 20_000),
            rpt_acct_1020: totals(5_000, 5_000),
            [INCOME]: totals(0, 50_000),
            rpt_acct_6100: totals(3_000, 3_000),
            rpt_acct_6200: totals(1_000, 0),
            [EQUITY]: totals(0, 10_000),
        },
        prior: { [INCOME]: totals(0, 50_000), rpt_acct_6200: totals(1_000, 0) },
        edge: { rpt_acct_2100: totals(700, 700), rpt_acct_4100: totals(400, 400) },
    }

    it('Active keeps accounts with a balance or a posting in the period, never activity before the fiscal year', () => {
        const model = build({ ...ACTIVITY, rows: 'active' })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
            { label: '1020 Reserve savings', debit: null, credit: null },
            { label: '2100 Business credit card', debit: null, credit: null },
            { label: "3000 Owner's investment", debit: null, credit: 10_000 },
            { label: '3900 Retained earnings', debit: null, credit: 49_000 },
            { label: '4100 Product sales', debit: null, credit: null },
            { label: '6100 Software subscriptions', debit: null, credit: null },
        ])
        expect(labels(model)).not.toContain('4000 Consulting income')
        expect(labels(model)).not.toContain('6200 Travel')
        expect(totalCells(model)).toEqual({ debit: 60_000, credit: 59_000 })
    })

    it('Non-zero leaves out zero balances', () => {
        const model = build({ ...ACTIVITY, rows: 'non-zero' })
        expect(labels(model)).toEqual([
            '1010 Operating checking',
            "3000 Owner's investment",
            '3900 Retained earnings',
        ])
    })
})

describe('buildTrialBalance account filter', () => {
    it('keeps one listed account, and the Total equals it', () => {
        const model = build({ filter: [BANK] })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
        ])
        expect(totalCells(model)).toEqual({ debit: 60_000, credit: 0 })
    })

    it('keeps the income group, of types income and other income', () => {
        const interest = testAccount(
            'rpt_acct_7000',
            '7000',
            'Interest earned',
            'other_income',
            'interest_earned'
        )
        const model = build({
            accounts: [...REPORT_ACCOUNTS, interest],
            edge: { [INCOME]: totals(0, 30_000), [interest.id]: totals(0, 1_000) },
            filter: ['group:income'],
        })
        expect(detailFigures(model)).toEqual([
            { label: '4000 Consulting income', debit: null, credit: 30_000 },
            { label: '7000 Interest earned', debit: null, credit: 1_000 },
        ])
        expect(totalCells(model)).toEqual({ debit: 0, credit: 31_000 })
    })

    it('keeps the synthetic retained earnings row in the equity group', () => {
        const model = build({ accounts: WITHOUT_RETAINED_ACCOUNT, filter: ['group:equity'] })
        expect(detailFigures(model)).toEqual([
            { label: "3000 Owner's investment", debit: null, credit: 30_000 },
            { label: 'Retained earnings', debit: null, credit: 50_000 },
        ])
        expect(totalCells(model)).toEqual({ debit: 0, credit: 80_000 })
    })

    it('combines a group and an account', () => {
        const model = build({ filter: ['group:expense', BANK] })
        expect(detailFigures(model)).toEqual([
            { label: '1010 Operating checking', debit: 60_000, credit: null },
            { label: '6000 Rent', debit: 20_000, credit: null },
        ])
        expect(totalCells(model)).toEqual({ debit: 80_000, credit: 0 })
    })

    it('matches nothing for an unknown id', () => {
        const model = build({ filter: ['rpt_acct_unknown'] })
        expect(details(model)).toEqual([])
        expect(totalCells(model)).toEqual({ debit: 0, credit: 0 })
    })
})

describe('buildTrialBalance order and size', () => {
    it('follows the account tree, so a child account follows its parent', () => {
        const child = testAccount('rpt_acct_1900', '1900', 'Petty cash', 'bank', 'cash_on_hand', {
            parent: BANK,
        })
        const model = build({
            accounts: [...REPORT_ACCOUNTS, child],
            through: {
                rpt_acct_1020: totals(4_000, 0),
                [child.id]: totals(1_000, 0),
                [BANK]: totals(2_000, 0),
                [EQUITY]: totals(0, 7_000),
            },
            prior: {},
        })
        expect(labels(model)).toEqual([
            '1010 Operating checking',
            '1900 Petty cash',
            '1020 Reserve savings',
            "3000 Owner's investment",
        ])
    })

    it('labels an account with a blank number by its name alone', () => {
        const unnumbered = testAccount(
            'rpt_acct_none',
            '',
            'Undeposited funds',
            'bank',
            'cash_on_hand'
        )
        const model = build({
            accounts: [...REPORT_ACCOUNTS, unnumbered],
            through: { [unnumbered.id]: totals(1_500, 0) },
            prior: {},
            filter: [unnumbered.id],
        })
        expect(detailFigures(model)).toEqual([
            { label: 'Undeposited funds', debit: 1_500, credit: null },
        ])
    })

    it('does not clamp a balance above the stored maximum', () => {
        const model = build({
            through: { [BANK]: totals(maxStoredAmount + 1, 0) },
            prior: {},
            filter: [BANK],
        })
        const [bank] = details(model)
        expect(bank?.cells.debit).toBe(maxStoredAmount + 1)
        expect(totalCells(model)?.debit).toBe(maxStoredAmount + 1)
        const shown = formatReportAmount(Number(bank?.cells.debit), 'USD', DEFAULT_NUMBER_FORMAT, {
            withSymbol: false,
        })
        expect(shown).toBe(REPORT_AMOUNT_ERROR)
    })
})
