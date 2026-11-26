// The dashboard preference (the dashboard design spec §3 "What is saved", §4
// "Preference shape"): one value per user, read through core useUserPreference.

import { z } from '@tinycld/core/ui/form'

export const WIDGET_IDS = [
    'invoices',
    'expenses',
    'bankAccounts',
    'profitAndLoss',
    'sales',
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export const WIDGET_NAMES: Record<WidgetId, string> = {
    invoices: 'Invoices',
    expenses: 'Expenses',
    bankAccounts: 'Bank accounts',
    profitAndLoss: 'Profit and loss',
    sales: 'Sales',
}

const PERIOD_IDS = [
    'this_month',
    'last_month',
    'this_quarter',
    'this_fiscal_year',
    'last_fiscal_year',
] as const

export type PeriodId = (typeof PERIOD_IDS)[number]

export const PERIOD_LABELS = {
    this_month: 'This month',
    last_month: 'Last month',
    this_quarter: 'This quarter',
    this_fiscal_year: 'This fiscal year',
    last_fiscal_year: 'Last fiscal year',
} as const satisfies Record<PeriodId, string>

const SALES_PERIOD_IDS = ['last_6_months', 'last_12_months', 'this_fiscal_year'] as const

export type SalesPeriodId = (typeof SALES_PERIOD_IDS)[number]

export const SALES_PERIOD_LABELS = {
    last_6_months: 'Last 6 months',
    last_12_months: 'Last 12 months',
    this_fiscal_year: 'This fiscal year',
} as const satisfies Record<SalesPeriodId, string>

const DEFAULT_PERIODS = {
    profitAndLoss: 'this_fiscal_year',
    expenses: 'this_fiscal_year',
    sales: 'last_6_months',
} as const

function isWidgetId(value: unknown): value is WidgetId {
    return WIDGET_IDS.some(id => id === value)
}

// The known ids of a stored list, each once, in the stored order: an id a later Books
// version dropped is not drawn.
function knownIds(values: readonly unknown[]): WidgetId[] {
    const ids: WidgetId[] = []
    for (const value of values) {
        if (isWidgetId(value) && !ids.includes(value)) ids.push(value)
    }
    return ids
}

// A widget added after the value was stored goes to the end, in default order, shown.
function withMissingIds(ids: WidgetId[]): WidgetId[] {
    return [...ids, ...WIDGET_IDS.filter(id => !ids.includes(id))]
}

const widgetListSchema = z.array(z.unknown()).transform(knownIds)

const prefsShape = z.object({
    order: widgetListSchema.transform(withMissingIds),
    hidden: widgetListSchema,
    hideAmounts: z.boolean().catch(false),
    periods: z.object({
        profitAndLoss: z.enum(PERIOD_IDS).catch(DEFAULT_PERIODS.profitAndLoss),
        expenses: z.enum(PERIOD_IDS).catch(DEFAULT_PERIODS.expenses),
        sales: z.enum(SALES_PERIOD_IDS).catch(DEFAULT_PERIODS.sales),
    }),
})

export type DashboardPrefs = z.infer<typeof prefsShape>

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
    order: [...WIDGET_IDS],
    hidden: [],
    hideAmounts: false,
    periods: { ...DEFAULT_PERIODS },
}

// Never fails: a value that does not parse as a whole is the defaults.
export const dashboardPrefsSchema = prefsShape.catch(DEFAULT_DASHBOARD_PREFS)

export function parseDashboardPrefs(value: unknown): DashboardPrefs {
    return dashboardPrefsSchema.parse(value)
}

// The ids the grid draws: the order without the hidden ids.
export function shownWidgets(prefs: DashboardPrefs): WidgetId[] {
    return prefs.order.filter(id => !prefs.hidden.includes(id))
}

// Moves a widget one place in the order, shown or hidden; at an end the value stays the same.
export function moveWidget(prefs: DashboardPrefs, id: WidgetId, by: -1 | 1): DashboardPrefs {
    const from = prefs.order.indexOf(id)
    const to = from + by
    if (from < 0 || to < 0 || to >= prefs.order.length) return prefs
    const order = [...prefs.order]
    order[from] = order[to]
    order[to] = id
    return { ...prefs, order }
}

// Adds the widget to `hidden` once, or takes it out; the order does not change.
export function setWidgetShown(
    prefs: DashboardPrefs,
    id: WidgetId,
    isShown: boolean
): DashboardPrefs {
    const others = prefs.hidden.filter(hiddenId => hiddenId !== id)
    const hidden = isShown ? others : [...others, id]
    return { ...prefs, hidden }
}

// The default order with every widget shown; Hide amounts and the periods are kept.
export function resetArrangement(prefs: DashboardPrefs): DashboardPrefs {
    return { ...prefs, order: [...WIDGET_IDS], hidden: [] }
}
