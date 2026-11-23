import { describe, expect, it } from 'vitest'
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'
import type { BankConnectionRow } from '../tinycld/books/hooks/useBankConnections'
import type { BalanceRow } from '../tinycld/books/hooks/useDashboardBalances'
import {
    BANK_ROW_LIMIT,
    bankAccountsModel,
    barShares,
    dashboardAmount,
    dashboardPercent,
    dashboardTone,
    expensesModel,
    invoicesModel,
    latestShownMonth,
    MASK,
    MASKED_PERCENT,
    paidWindowStart,
    profitAndLossModel,
    salesModel,
    undepositedBalance,
} from '../tinycld/books/lib/dashboard-figures'
import {
    DASHBOARD_STATES,
    DASHBOARD_TODAY,
    INVOICE_DUE_TOTALS,
    PAYMENT_DAY_TOTALS,
} from '../tinycld/books/lib/dashboard-fixture'
import type { MonthRange } from '../tinycld/books/lib/dashboard-periods'
import { amountText, formatMoney, MINUS, TOO_LARGE_TEXT } from '../tinycld/books/lib/money'
import { publishedRow } from './live-rows'

describe('dashboardAmount', () => {
    it('draws an amount as amountText does', () => {
        expect(dashboardAmount(123456, 'USD', false)).toBe(amountText(123456, 'USD'))
    })

    it("draws zero as the currency's zero, never blank", () => {
        expect(dashboardAmount(0, 'USD', false)).toBe(formatMoney(0, 'USD'))
        expect(dashboardAmount(0, 'USD', false)).not.toBe('')
    })

    it('draws a negative amount as amountText does, with its hyphen sign', () => {
        const text = dashboardAmount(-4521000, 'USD', false)
        expect(text).toBe(amountText(-4521000, 'USD'))
        expect(text.startsWith('-')).toBe(true)
        expect(text.startsWith(MINUS)).toBe(false)
    })

    it('draws an amount Books cannot hold exactly as TOO_LARGE_TEXT', () => {
        expect(dashboardAmount(null, 'USD', false)).toBe(TOO_LARGE_TEXT)
    })

    it.each([
        ['a positive amount', 123456],
        ['zero', 0],
        ['a negative amount', -4521000],
        ['an amount too large', null],
    ])('masks %s as five dots when amounts are hidden', (_name, cents) => {
        expect(dashboardAmount(cents, 'USD', true)).toBe('•••••')
        expect(MASK).toBe('•••••')
    })
})

describe('dashboardPercent', () => {
    it('draws a percent, and the mask when amounts are hidden', () => {
        expect(dashboardPercent(12, false)).toBe('12%')
        expect(dashboardPercent(12, true)).toBe('••%')
        expect(MASKED_PERCENT).toBe('••%')
    })
})

describe('dashboardTone', () => {
    it('is danger only for an amount too large with amounts shown', () => {
        expect(dashboardTone(null, false)).toBe('danger')
    })

    it.each([
        ['an amount too large with amounts hidden', null, true],
        ['zero with amounts shown', 0, false],
        ['an amount with amounts hidden', 123456, true],
    ] as const)('is normal for %s', (_name, cents, hide) => {
        expect(dashboardTone(cents, hide)).toBe('normal')
    })
})

describe('paidWindowStart', () => {
    it('is today minus 29 days', () => {
        expect(paidWindowStart('2026-11-22')).toBe('2026-10-24')
    })
})

function due(due_date: string, balance: number, count = 1) {
    return { due_date, balance, count }
}

function paid(date: string, amount: number) {
    return { date, amount }
}

describe('invoicesModel', () => {
    it("over the fixture's rows equals the fixture's populated Invoices model", () => {
        const populated = DASHBOARD_STATES.populated.widgets.invoices
        if (populated.status !== 'ready') throw new Error('the populated fixture is not ready')
        const model = invoicesModel({
            dueTotals: INVOICE_DUE_TOTALS,
            paymentTotals: PAYMENT_DAY_TOTALS,
            undepositedCents: 185000,
            today: DASHBOARD_TODAY,
        })
        expect(model).toEqual(populated.model)
        expect(model).toEqual({
            isEmpty: false,
            unpaid: 894000,
            overdue: 276000,
            notDue: 618000,
            overdueCount: 3,
            paidLast30Days: 1241500,
            waitingToDeposit: 185000,
        })
    })

    it('counts a row due the day before today as overdue and a row due today as not due', () => {
        const model = invoicesModel({
            dueTotals: [due('2026-11-21', 5000, 2), due('2026-11-22', 7000, 3)],
            paymentTotals: [],
            undepositedCents: 0,
            today: '2026-11-22',
        })
        expect(model.overdue).toBe(5000)
        expect(model.overdueCount).toBe(2)
        expect(model.notDue).toBe(7000)
        expect(model.unpaid).toBe(12000)
    })

    it('counts a payment dated today minus 29 days, not one dated today minus 30 days or after today', () => {
        const model = invoicesModel({
            dueTotals: [],
            paymentTotals: [
                paid('2026-10-23', 100),
                paid('2026-10-24', 2000),
                paid('2026-11-22', 30000),
                paid('2026-11-23', 400000),
            ],
            undepositedCents: 0,
            today: '2026-11-22',
        })
        expect(model.paidLast30Days).toBe(32000)
    })

    it('is empty with no due row and no payment in the window, also with money waiting to deposit', () => {
        const model = invoicesModel({
            dueTotals: [],
            paymentTotals: [paid('2026-10-23', 100), paid('2026-11-23', 100)],
            undepositedCents: 185000,
            today: '2026-11-22',
        })
        expect(model.isEmpty).toBe(true)
        expect(model.waitingToDeposit).toBe(185000)
    })

    it('is not empty with one payment in the window and no due row', () => {
        const model = invoicesModel({
            dueTotals: [],
            paymentTotals: [paid('2026-11-01', 100)],
            undepositedCents: 0,
            today: '2026-11-22',
        })
        expect(model.isEmpty).toBe(false)
        expect(model.paidLast30Days).toBe(100)
    })

    it('keeps an undeposited balance Books cannot hold exactly as null', () => {
        const model = invoicesModel({
            dueTotals: [due('2026-12-01', 100)],
            paymentTotals: [],
            undepositedCents: null,
            today: '2026-11-22',
        })
        expect(model.waitingToDeposit).toBeNull()
        expect(dashboardAmount(model.waitingToDeposit, 'USD', false)).toBe(TOO_LARGE_TEXT)
    })
})

function account(
    fields: Pick<AccountRow, 'id' | 'type' | 'detail_type' | 'debit_total' | 'credit_total'> &
        Partial<Pick<AccountRow, 'inactive'>>
): AccountRow {
    return publishedRow(
        {
            name: fields.id,
            number: '',
            parent: '',
            inactive: false,
            description: '',
            currency: 'USD',
            ...fields,
        },
        'books_accounts'
    )
}

describe('undepositedBalance', () => {
    it('sums debit minus credit of the active Undeposited funds accounts only', () => {
        const rows = [
            account({
                id: 'undep1',
                type: 'other_current_asset',
                detail_type: 'undeposited_funds',
                debit_total: 200000,
                credit_total: 50000,
            }),
            account({
                id: 'undep2',
                type: 'other_current_asset',
                detail_type: 'undeposited_funds',
                debit_total: 35000,
                credit_total: 0,
            }),
            account({
                id: 'undepold',
                type: 'other_current_asset',
                detail_type: 'undeposited_funds',
                debit_total: 900000,
                credit_total: 0,
                inactive: true,
            }),
            account({
                id: 'checking',
                type: 'bank',
                detail_type: 'checking',
                debit_total: 7000000,
                credit_total: 100,
            }),
        ]
        expect(undepositedBalance(rows)).toBe(185000)
    })

    it('is null when one balance is past the safe integer range', () => {
        const rows = [
            account({
                id: 'undep1',
                type: 'other_current_asset',
                detail_type: 'undeposited_funds',
                debit_total: 200000,
                credit_total: 0,
            }),
            account({
                id: 'undep2',
                type: 'other_current_asset',
                detail_type: 'undeposited_funds',
                debit_total: Number.MAX_SAFE_INTEGER + 2,
                credit_total: 0,
            }),
        ]
        expect(undepositedBalance(rows)).toBeNull()
    })
})

type BalanceFields = Pick<BalanceRow, 'account' | 'month_start' | 'type'> &
    Partial<Pick<BalanceRow, 'debit_total' | 'credit_total' | 'parent' | 'name' | 'number'>>

function balance(fields: BalanceFields): BalanceRow {
    const row: BalanceRow = {
        debit_total: 0,
        credit_total: 0,
        parent: '',
        name: fields.account,
        number: '',
        ...fields,
    }
    return row
}

// The ranges are written out (tests/dashboard-periods.test.ts proves periodRange gives
// them), so these cases test the models alone.
function monthRange(from: string, to: string, months: string[]): MonthRange {
    return { from, to, months }
}

// October to December 2026, and its year before, October to December 2025.
const QUARTER = monthRange('2026-10-01', '2026-12-31', ['2026-10-01', '2026-11-01', '2026-12-01'])

function spent(account: string, debit: number, extra: Partial<BalanceFields> = {}): BalanceRow {
    return balance({
        account,
        month_start: '2026-10-01',
        type: 'expense',
        debit_total: debit,
        ...extra,
    })
}

describe('expensesModel', () => {
    it('counts debit minus credit of cost of goods sold, expense and other expense in the range only', () => {
        const model = expensesModel(
            [
                spent('cogs', 10000, { type: 'cost_of_goods_sold', credit_total: 1000 }),
                spent('rent', 5000, { month_start: '2026-11-01' }),
                spent('fees', 2000, { type: 'other_expense', month_start: '2026-12-01' }),
                spent('sales', 0, { type: 'income', credit_total: 90000, debit_total: 70000 }),
                spent('rent', 40000, { month_start: '2026-09-01' }),
                spent('rent', 80000, { month_start: '2027-01-01' }),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.total).toBe(16000)
        expect(model.isEmpty).toBe(false)
        expect(model.period).toBe('this_quarter')
        expect(model.rows.map(row => [row.label, row.amount])).toEqual([
            ['cogs', 9000],
            ['rent', 5000],
            ['fees', 2000],
        ])
    })

    it("adds a sub-account's amount to its top-level parent, two levels deep too, under the parent's name", () => {
        const model = expensesModel(
            [
                spent('office', 1000, { name: 'Office' }),
                spent('supplies', 2000, { name: 'Supplies', parent: 'office' }),
                spent('paper', 4000, { name: 'Paper', parent: 'supplies' }),
                spent('travel', 500, { name: 'Travel' }),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.rows.map(row => [row.label, row.amount])).toEqual([
            ['Office', 7000],
            ['Travel', 500],
        ])
        expect(model.total).toBe(7500)
    })

    it('lists sub-accounts under a header account with no balance row, read from the accounts list', () => {
        const accounts: Pick<AccountRow, 'id' | 'parent' | 'name' | 'number'>[] = [
            { id: 'opex', parent: '', name: 'Operating expenses', number: '6000' },
            { id: 'rent', parent: 'opex', name: 'Rent', number: '6100' },
            { id: 'utilities', parent: 'opex', name: 'Utilities', number: '6200' },
            { id: 'power', parent: 'utilities', name: 'Power', number: '6210' },
            { id: 'travel', parent: '', name: 'Travel', number: '' },
        ]
        const model = expensesModel(
            [
                spent('rent', 3000, { name: 'Rent', number: '6100', parent: 'opex' }),
                spent('power', 2000, { name: 'Power', number: '6210', parent: 'utilities' }),
                spent('travel', 500, { name: 'Travel' }),
            ],
            'this_quarter',
            QUARTER,
            accounts
        )
        expect(model.rows.map(row => [row.key, row.label, row.amount])).toEqual([
            ['opex', '6000 Operating expenses', 5000],
            ['travel', 'Travel', 500],
        ])
        expect(model.total).toBe(5500)
    })

    it('gives the four largest by amount and a fifth "Everything else" row with the rest', () => {
        const model = expensesModel(
            [
                spent('e', 1000),
                spent('c', 3000),
                spent('a', 5000),
                spent('d', 2000),
                spent('b', 4000),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.rows.map(row => [row.label, row.amount, row.share])).toEqual([
            ['a', 5000, 1],
            ['b', 4000, 0.8],
            ['c', 3000, 0.6],
            ['d', 2000, 0.4],
            ['Everything else', 1000, 0.2],
        ])
        expect(model.rows.map(row => row.isEverythingElse)).toEqual([
            false,
            false,
            false,
            false,
            true,
        ])
        expect(model.total).toBe(15000)
    })

    it('lists an account with a net credit in "Everything else", also when only three others have an amount', () => {
        const model = expensesModel(
            [
                spent('a', 5000),
                spent('b', 4000),
                spent('c', 3000),
                spent('refund', 1000, { credit_total: 3500 }),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.rows.map(row => [row.label, row.amount])).toEqual([
            ['a', 5000],
            ['b', 4000],
            ['c', 3000],
            ['Everything else', -2500],
        ])
        expect(model.rows[3].isEverythingElse).toBe(true)
        expect(model.rows.some(row => row.label === 'refund')).toBe(false)
        expect(model.total).toBe(9500)
    })

    it('gives exactly four rows and no fifth when four accounts have an amount', () => {
        const model = expensesModel(
            [spent('a', 5000), spent('b', 4000), spent('c', 3000), spent('d', 2000)],
            'this_quarter',
            QUARTER
        )
        expect(model.rows.map(row => row.label)).toEqual(['a', 'b', 'c', 'd'])
        expect(model.rows.some(row => row.isEverythingElse)).toBe(false)
    })

    it('is empty with no expense-side row in the range', () => {
        const model = expensesModel(
            [
                spent('rent', 5000, { month_start: '2026-09-01' }),
                spent('sales', 0, { type: 'income', credit_total: 9000 }),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.isEmpty).toBe(true)
        expect(model.rows).toEqual([])
        expect(model.total).toBe(0)
    })
})

function earned(
    month_start: string,
    credit: number,
    type: BalanceRow['type'] = 'income'
): BalanceRow {
    return balance({ account: `inc-${type}`, month_start, type, credit_total: credit })
}

function cost(month_start: string, debit: number): BalanceRow {
    return balance({ account: 'exp', month_start, type: 'expense', debit_total: debit })
}

describe('profitAndLossModel', () => {
    it('is income (credit minus debit of income and other income) minus the Expenses total', () => {
        const rows = [
            earned('2026-10-01', 100000),
            balance({
                account: 'interest',
                month_start: '2026-11-01',
                type: 'other_income',
                credit_total: 6000,
                debit_total: 1000,
            }),
            cost('2026-10-01', 30000),
            balance({
                account: 'cogs',
                month_start: '2026-12-01',
                type: 'cost_of_goods_sold',
                debit_total: 5000,
            }),
        ]
        const model = profitAndLossModel(rows, 'this_quarter', QUARTER)
        expect(model.income).toBe(105000)
        expect(model.expenses).toBe(expensesModel(rows, 'this_quarter', QUARTER).total)
        expect(model.expenses).toBe(35000)
        expect(model.netProfit).toBe(70000)
        expect(model.isEmpty).toBe(false)
    })

    it('is negative for a loss', () => {
        const model = profitAndLossModel(
            [earned('2026-10-01', 1000), cost('2026-10-01', 4000)],
            'this_quarter',
            QUARTER
        )
        expect(model.netProfit).toBe(-3000)
    })

    it('is up 25% for 1000 against 800 the year before', () => {
        const model = profitAndLossModel(
            [
                earned('2026-10-01', 1500),
                cost('2026-11-01', 500),
                earned('2025-10-01', 1000),
                cost('2025-12-01', 200),
            ],
            'this_quarter',
            QUARTER
        )
        expect(model.netProfit).toBe(1000)
        expect(model.change).toEqual({ direction: 'up', percent: 25 })
    })

    it('is down 50% for 400 against 800 the year before', () => {
        const model = profitAndLossModel(
            [earned('2026-10-01', 400), earned('2025-11-01', 800)],
            'this_quarter',
            QUARTER
        )
        expect(model.change).toEqual({ direction: 'down', percent: 50 })
    })

    it('has no change when the year before has no income and no expense', () => {
        const model = profitAndLossModel(
            [earned('2026-10-01', 400), earned('2025-09-01', 800)],
            'this_quarter',
            QUARTER
        )
        expect(model.change).toBeNull()
    })

    it('has no change when the net of the year before is zero', () => {
        const model = profitAndLossModel(
            [earned('2026-10-01', 400), earned('2025-10-01', 800), cost('2025-10-01', 800)],
            'this_quarter',
            QUARTER
        )
        expect(model.change).toBeNull()
    })

    it('is empty with nothing in the range, also when the year before has figures', () => {
        const model = profitAndLossModel(
            [earned('2025-10-01', 800), cost('2025-11-01', 100)],
            'this_quarter',
            QUARTER
        )
        expect(model.isEmpty).toBe(true)
    })
})

describe('barShares', () => {
    it('makes the longer bar 1 and the other its share; zero or negative is 0', () => {
        expect(barShares(1000, 250)).toEqual([1, 0.25])
        expect(barShares(250, 1000)).toEqual([0.25, 1])
        expect(barShares(0, 0)).toEqual([0, 0])
        expect(barShares(-50, 100)).toEqual([0, 1])
    })
})

// June to November 2026.
const SIX_MONTHS = monthRange('2026-06-01', '2026-11-30', [
    '2026-06-01',
    '2026-07-01',
    '2026-08-01',
    '2026-09-01',
    '2026-10-01',
    '2026-11-01',
])

describe('salesModel', () => {
    it('gives one month per month of the range, in order, from income only', () => {
        const model = salesModel(
            [
                earned('2026-07-01', 5000),
                balance({
                    account: 'inc-income',
                    month_start: '2026-09-01',
                    type: 'income',
                    credit_total: 1000,
                    debit_total: 3000,
                }),
                earned('2026-08-01', 9999, 'other_income'),
                earned('2026-05-01', 70000),
            ],
            'last_6_months',
            SIX_MONTHS,
            '2026-11-22'
        )
        expect(model.months.map(month => [month.month, month.amount])).toEqual([
            ['2026-06-01', 0],
            ['2026-07-01', 5000],
            ['2026-08-01', 0],
            ['2026-09-01', -2000],
            ['2026-10-01', 0],
            ['2026-11-01', 0],
        ])
        expect(model.months[3]).toMatchObject({ shortLabel: 'Sep', longLabel: 'Sep 2026' })
        expect(model.total).toBe(3000)
        expect(model.isEmpty).toBe(false)
        expect(model.period).toBe('last_6_months')
    })

    it('is empty when every month is 0 and no income row is in the range', () => {
        const model = salesModel(
            [earned('2026-08-01', 9999, 'other_income'), earned('2026-05-01', 70000)],
            'last_6_months',
            SIX_MONTHS,
            '2026-11-22'
        )
        expect(model.isEmpty).toBe(true)
        expect(model.total).toBe(0)
        expect(model.months).toHaveLength(6)
    })
})

describe('latestShownMonth', () => {
    const fiscalYear = monthRange(
        '2026-01-01',
        '2026-12-31',
        Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`)
    )
    const monthsOf = () => salesModel([], 'this_fiscal_year', fiscalYear, '2026-11-22').months

    it("is the last month not after today's month for a year that runs past today", () => {
        const months = monthsOf()
        expect(months).toHaveLength(12)
        expect(latestShownMonth(months, '2026-11-22')?.month).toBe('2026-11-01')
    })

    it('is the last month when every month is in the past', () => {
        expect(latestShownMonth(monthsOf(), '2027-03-05')?.month).toBe('2026-12-01')
    })
})

function chartAccount(
    fields: Pick<AccountRow, 'id' | 'name' | 'number' | 'type'> &
        Partial<Pick<AccountRow, 'inactive' | 'detail_type' | 'debit_total' | 'credit_total'>>
): AccountRow {
    return publishedRow(
        {
            parent: '',
            inactive: false,
            description: '',
            currency: 'USD',
            detail_type: '',
            debit_total: 0,
            credit_total: 0,
            ...fields,
        },
        'books_accounts'
    )
}

function connection(id: string, account: string, reviewCount: number): BankConnectionRow {
    return publishedRow(
        {
            id,
            account,
            accountName: account,
            accountNumber: '',
            accountType: 'bank',
            accountInactive: false,
            inProgress: undefined,
            institution: 'Bank',
            accountMask: '',
            debitTotal: 0,
            creditTotal: 0,
            waitingCount: 0,
            lastUploadAt: undefined,
            reviewCount,
        },
        'books_bank_connections'
    )
}

describe('bankAccountsModel', () => {
    it('lists active Bank and Credit card accounts in chart order with their books balance', () => {
        const model = bankAccountsModel(
            [
                chartAccount({
                    id: 'savings',
                    name: 'Savings',
                    number: '10500',
                    type: 'bank',
                    debit_total: 1000,
                    credit_total: 4000,
                }),
                chartAccount({
                    id: 'card',
                    name: 'Petty card',
                    number: '',
                    type: 'credit_card',
                    debit_total: 10000,
                    credit_total: 30000,
                }),
                chartAccount({
                    id: 'checking',
                    name: 'Checking',
                    number: '900',
                    type: 'bank',
                    debit_total: 50000,
                }),
                chartAccount({
                    id: 'old',
                    name: 'Old bank',
                    number: '100',
                    type: 'bank',
                    inactive: true,
                }),
                chartAccount({
                    id: 'undeposited',
                    name: 'Undeposited funds',
                    number: '120',
                    type: 'other_current_asset',
                    detail_type: 'undeposited_funds',
                    debit_total: 5000,
                }),
            ],
            [connection('conn1', 'checking', 3)]
        )
        expect(model.isEmpty).toBe(false)
        expect(model.moreCount).toBe(0)
        expect(model.rows).toEqual([
            {
                accountId: 'checking',
                label: '900 Checking',
                balance: 50000,
                connectionId: 'conn1',
                reviewCount: 3,
            },
            {
                accountId: 'savings',
                label: '10500 Savings',
                balance: -3000,
                connectionId: null,
                reviewCount: 0,
            },
            {
                accountId: 'card',
                label: 'Petty card',
                balance: 20000,
                connectionId: null,
                reviewCount: 0,
            },
        ])
    })

    it('shows six rows of eight accounts and counts two more', () => {
        const accounts = Array.from({ length: 8 }, (_, i) =>
            chartAccount({ id: `bank${i}`, name: `Bank ${i}`, number: `${1000 + i}`, type: 'bank' })
        )
        const model = bankAccountsModel(accounts, [])
        expect(BANK_ROW_LIMIT).toBe(6)
        expect(model.rows.map(row => row.accountId)).toEqual([
            'bank0',
            'bank1',
            'bank2',
            'bank3',
            'bank4',
            'bank5',
        ])
        expect(model.moreCount).toBe(2)
    })

    it('is empty with no Bank or Credit card account', () => {
        const model = bankAccountsModel(
            [chartAccount({ id: 'rent', name: 'Rent', number: '6000', type: 'expense' })],
            []
        )
        expect(model.isEmpty).toBe(true)
        expect(model.rows).toEqual([])
    })

    it('keeps a balance Books cannot hold exactly as null', () => {
        const model = bankAccountsModel(
            [
                chartAccount({
                    id: 'huge',
                    name: 'Huge',
                    number: '1000',
                    type: 'bank',
                    debit_total: Number.MAX_SAFE_INTEGER + 2,
                }),
            ],
            []
        )
        expect(model.rows[0].balance).toBeNull()
    })
})
