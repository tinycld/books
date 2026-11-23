import { describe, expect, it } from 'vitest'
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'
import {
    dashboardAmount,
    dashboardPercent,
    dashboardTone,
    invoicesModel,
    MASK,
    MASKED_PERCENT,
    paidWindowStart,
    undepositedBalance,
} from '../tinycld/books/lib/dashboard-figures'
import {
    DASHBOARD_STATES,
    DASHBOARD_TODAY,
    INVOICE_DUE_TOTALS,
    PAYMENT_DAY_TOTALS,
} from '../tinycld/books/lib/dashboard-fixture'
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
