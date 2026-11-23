import { describe, expect, it } from 'vitest'
import {
    type DashboardPrefs,
    DEFAULT_DASHBOARD_PREFS,
    moveWidget,
    parseDashboardPrefs,
    resetArrangement,
    setWidgetShown,
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

// A value with every part away from its default, so a function that drops or resets a part
// it must keep fails.
const ARRANGED: DashboardPrefs = {
    order: ['bankAccounts', 'invoices', 'sales', 'expenses', 'profitAndLoss'],
    hidden: ['expenses'],
    hideAmounts: true,
    periods: { profitAndLoss: 'last_month', expenses: 'this_quarter', sales: 'last_12_months' },
}

function frozenCopy(prefs: DashboardPrefs): DashboardPrefs {
    return parseDashboardPrefs(JSON.parse(JSON.stringify(prefs)))
}

// Spec §3 "Customize": Move up and Move down change the order by one place and are
// disabled at the ends.
describe('moveWidget', () => {
    it('by -1 swaps the id with the one before it and keeps hidden, hideAmounts and periods', () => {
        const before = frozenCopy(ARRANGED)
        const moved = moveWidget(ARRANGED, 'sales', -1)
        expect(moved.order).toEqual([
            'bankAccounts',
            'sales',
            'invoices',
            'expenses',
            'profitAndLoss',
        ])
        expect(moved.hidden).toEqual(['expenses'])
        expect(moved.hideAmounts).toBe(true)
        expect(moved.periods).toEqual(ARRANGED.periods)
        expect(ARRANGED).toEqual(before)
    })

    it('by 1 swaps the id with the one after it', () => {
        const before = frozenCopy(ARRANGED)
        const moved = moveWidget(ARRANGED, 'invoices', 1)
        expect(moved.order).toEqual([
            'bankAccounts',
            'sales',
            'invoices',
            'expenses',
            'profitAndLoss',
        ])
        expect(moved.hidden).toEqual(['expenses'])
        expect(moved.hideAmounts).toBe(true)
        expect(moved.periods).toEqual(ARRANGED.periods)
        expect(ARRANGED).toEqual(before)
    })

    it('returns an equal value for the first id by -1 and the last id by 1', () => {
        expect(moveWidget(ARRANGED, 'bankAccounts', -1)).toEqual(ARRANGED)
        expect(moveWidget(ARRANGED, 'profitAndLoss', 1)).toEqual(ARRANGED)
    })

    it('moves a hidden widget like a shown one', () => {
        expect(moveWidget(ARRANGED, 'expenses', -1).order).toEqual([
            'bankAccounts',
            'invoices',
            'expenses',
            'sales',
            'profitAndLoss',
        ])
        expect(moveWidget(ARRANGED, 'expenses', 1).order).toEqual([
            'bankAccounts',
            'invoices',
            'sales',
            'profitAndLoss',
            'expenses',
        ])
        expect(moveWidget(ARRANGED, 'expenses', 1).hidden).toEqual(['expenses'])
    })
})

// Spec §3 "Customize": the Show switch of a row.
describe('setWidgetShown', () => {
    it('adds the id to hidden once, keeps the order, and true removes it', () => {
        const before = frozenCopy(ARRANGED)
        const hidden = setWidgetShown(ARRANGED, 'sales', false)
        expect(hidden.hidden).toEqual(['expenses', 'sales'])
        expect(hidden.order).toEqual(ARRANGED.order)
        expect(ARRANGED).toEqual(before)

        const twice = setWidgetShown(hidden, 'sales', false)
        expect(twice.hidden.filter(id => id === 'sales')).toEqual(['sales'])
        expect(twice.hidden).toEqual(['expenses', 'sales'])

        const shown = setWidgetShown(twice, 'sales', true)
        expect(shown.hidden).toEqual(['expenses'])
        expect(shown.order).toEqual(ARRANGED.order)
        expect(shown.hideAmounts).toBe(true)
        expect(shown.periods).toEqual(ARRANGED.periods)
    })

    it('shows a shown widget with no change', () => {
        expect(setWidgetShown(ARRANGED, 'sales', true)).toEqual(ARRANGED)
    })
})

// Spec §3 "Customize": Reset to default restores the default order and shows all five; it
// does not change Hide amounts or a widget's period.
describe('resetArrangement', () => {
    it('gives the default order and no hidden ids, and keeps hideAmounts and periods', () => {
        const changed: DashboardPrefs = {
            ...ARRANGED,
            hidden: ['sales', 'invoices', 'bankAccounts'],
        }
        const before = frozenCopy(changed)
        const reset = resetArrangement(changed)
        expect(reset.order).toEqual(DEFAULT_DASHBOARD_PREFS.order)
        expect(reset.order).toEqual([...WIDGET_IDS])
        expect(reset.hidden).toEqual([])
        expect(reset.hideAmounts).toBe(true)
        expect(reset.periods).toEqual({
            profitAndLoss: 'last_month',
            expenses: 'this_quarter',
            sales: 'last_12_months',
        })
        expect(changed).toEqual(before)
    })
})
