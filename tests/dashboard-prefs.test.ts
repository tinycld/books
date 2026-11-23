import { describe, expect, it } from 'vitest'
import {
    type DashboardPrefs,
    DEFAULT_DASHBOARD_PREFS,
    parseDashboardPrefs,
    shownWidgets,
    WIDGET_IDS,
} from '../tinycld/books/lib/dashboard-prefs'

// Spec §3 "What is saved": a value that does not parse falls back to the defaults; a
// missing widget id goes to the end, shown; an unknown id is dropped.
describe('parseDashboardPrefs', () => {
    it.each([
        ['undefined', undefined],
        ['null', null],
        ['a string', 'dashboard'],
        ['an array', ['invoices', 'sales']],
        ['an object whose order is not an array', { order: 'invoices', hidden: [] }],
    ])('returns the defaults for %s', (_name, value) => {
        expect(parseDashboardPrefs(value)).toEqual(DEFAULT_DASHBOARD_PREFS)
    })

    it('puts the ids a stored order lacks at the end, in default order, and shows them', () => {
        const prefs = parseDashboardPrefs({
            ...DEFAULT_DASHBOARD_PREFS,
            order: ['sales', 'invoices'],
            hidden: [],
        })
        expect(prefs.order).toEqual([
            'sales',
            'invoices',
            'expenses',
            'bankAccounts',
            'profitAndLoss',
        ])
        expect(prefs.hidden).toEqual([])
    })

    it('drops an unknown id from order and hidden and keeps a repeated id once', () => {
        const prefs = parseDashboardPrefs({
            ...DEFAULT_DASHBOARD_PREFS,
            order: [
                'bankAccounts',
                'cashFlow',
                'bankAccounts',
                'invoices',
                'expenses',
                'sales',
                'profitAndLoss',
                'invoices',
            ],
            hidden: ['shortcuts', 'sales', 'sales'],
        })
        expect(prefs.order).toEqual([
            'bankAccounts',
            'invoices',
            'expenses',
            'sales',
            'profitAndLoss',
        ])
        expect(prefs.hidden).toEqual(['sales'])
    })

    it('falls back to the default period for an unknown period id and keeps the other two', () => {
        const prefs = parseDashboardPrefs({
            ...DEFAULT_DASHBOARD_PREFS,
            periods: {
                profitAndLoss: 'last_month',
                expenses: 'last_week',
                sales: 'last_12_months',
            },
        })
        expect(prefs.periods).toEqual({
            profitAndLoss: 'last_month',
            expenses: DEFAULT_DASHBOARD_PREFS.periods.expenses,
            sales: 'last_12_months',
        })

        const sales = parseDashboardPrefs({
            ...DEFAULT_DASHBOARD_PREFS,
            periods: { profitAndLoss: 'this_quarter', expenses: 'this_month', sales: 'this_month' },
        })
        expect(sales.periods).toEqual({
            profitAndLoss: 'this_quarter',
            expenses: 'this_month',
            sales: DEFAULT_DASHBOARD_PREFS.periods.sales,
        })
    })

    it('reads a non-boolean hideAmounts as false', () => {
        expect(
            parseDashboardPrefs({ ...DEFAULT_DASHBOARD_PREFS, hideAmounts: 'yes' }).hideAmounts
        ).toBe(false)
        expect(
            parseDashboardPrefs({ ...DEFAULT_DASHBOARD_PREFS, hideAmounts: 1 }).hideAmounts
        ).toBe(false)
        expect(
            parseDashboardPrefs({ ...DEFAULT_DASHBOARD_PREFS, hideAmounts: true }).hideAmounts
        ).toBe(true)
    })

    it('gives back a valid stored value equal to itself', () => {
        const stored: DashboardPrefs = {
            order: ['bankAccounts', 'invoices', 'expenses', 'profitAndLoss', 'sales'],
            hidden: ['sales', 'expenses'],
            hideAmounts: true,
            periods: {
                profitAndLoss: 'last_fiscal_year',
                expenses: 'this_quarter',
                sales: 'this_fiscal_year',
            },
        }
        expect(parseDashboardPrefs(structuredClone(stored))).toEqual(stored)
    })
})

describe('shownWidgets', () => {
    it('gives the order without the hidden ids', () => {
        expect(
            shownWidgets({
                ...DEFAULT_DASHBOARD_PREFS,
                order: ['sales', 'invoices', 'expenses', 'bankAccounts', 'profitAndLoss'],
                hidden: ['invoices', 'bankAccounts'],
            })
        ).toEqual(['sales', 'expenses', 'profitAndLoss'])
    })

    it('gives [] when all five are hidden', () => {
        expect(shownWidgets({ ...DEFAULT_DASHBOARD_PREFS, hidden: [...WIDGET_IDS] })).toEqual([])
    })
})
