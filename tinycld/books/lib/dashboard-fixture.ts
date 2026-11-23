// Synthetic data for the Books dashboard (spec docs/specs/dashboard-design.md): the
// helix reference route reads it directly. It holds the widget models of each state
// the spec names, and the rows of the two new views those models are summed from.
//
// Account numbers and names are the seeded book's (lib/seed-accounts.ts), except in
// the `long` state, whose names exist only to exercise truncation.
//
// The two view-row interfaces mirror spec §4 "New views". The migration checkpoint
// that adds `2100000041_create_books_dashboard_views.js` must replace them with the
// generated row types (`BooksInvoiceDueTotals`, `BooksPaymentDayTotals`, ../types).
// The widget model types below are the shapes `lib/dashboard-figures.ts` and
// `lib/dashboard-prefs.ts` return; the checkpoint that adds those modules moves the
// types there and this file imports them.

// The day the reference is drawn on: Overdue and the 30-day window are computed against it.
export const DASHBOARD_TODAY = '2026-11-22'

export const DASHBOARD_CURRENCY = 'USD'

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

export const PERIOD_LABELS = {
    this_month: 'This month',
    last_month: 'Last month',
    this_quarter: 'This quarter',
    this_fiscal_year: 'This fiscal year',
    last_fiscal_year: 'Last fiscal year',
} as const

export type PeriodId = keyof typeof PERIOD_LABELS

export const SALES_PERIOD_LABELS = {
    last_6_months: 'Last 6 months',
    last_12_months: 'Last 12 months',
    this_fiscal_year: 'This fiscal year',
} as const

export type SalesPeriodId = keyof typeof SALES_PERIOD_LABELS

// Spec §4 "Preference shape".
export interface DashboardPrefs {
    order: WidgetId[]
    hidden: WidgetId[]
    hideAmounts: boolean
    periods: { profitAndLoss: PeriodId; expenses: PeriodId; sales: SalesPeriodId }
}

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
    order: [...WIDGET_IDS],
    hidden: [],
    hideAmounts: false,
    periods: {
        profitAndLoss: 'this_fiscal_year',
        expenses: 'this_fiscal_year',
        sales: 'last_6_months',
    },
}

// A row of the view `books_invoice_due_totals`: id = the due date, amounts in integer cents.
export interface InvoiceDueTotalRow {
    id: string
    due_date: string
    balance: number
    count: number
}

// A row of the view `books_payment_day_totals`: id = the date, amounts in integer cents.
export interface PaymentDayTotalRow {
    id: string
    date: string
    amount: number
    count: number
}

// Three due dates before DASHBOARD_TODAY (overdue: 2,760.00 over 3 invoices) and two
// after it (not due yet: 6,180.00).
export const INVOICE_DUE_TOTALS: InvoiceDueTotalRow[] = [
    { id: '2026-10-15', due_date: '2026-10-15', balance: 120000, count: 1 },
    { id: '2026-11-05', due_date: '2026-11-05', balance: 96000, count: 1 },
    { id: '2026-11-18', due_date: '2026-11-18', balance: 60000, count: 1 },
    { id: '2026-11-30', due_date: '2026-11-30', balance: 250000, count: 2 },
    { id: '2026-12-15', due_date: '2026-12-15', balance: 368000, count: 3 },
]

// The window is 2026-10-24 to 2026-11-22: the first row is one day too early and is
// not counted (paid, last 30 days: 12,415.00).
export const PAYMENT_DAY_TOTALS: PaymentDayTotalRow[] = [
    { id: '2026-10-23', date: '2026-10-23', amount: 88000, count: 1 },
    { id: '2026-10-28', date: '2026-10-28', amount: 415000, count: 2 },
    { id: '2026-11-06', date: '2026-11-06', amount: 326500, count: 1 },
    { id: '2026-11-19', date: '2026-11-19', amount: 500000, count: 3 },
]

// Every amount of a model is in integer cents.
export interface InvoicesModel {
    isEmpty: boolean
    unpaid: number
    overdue: number
    notDue: number
    overdueCount: number
    paidLast30Days: number
    // The balance of the Undeposited funds accounts; the line shows only when not zero.
    waitingToDeposit: number
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
    balance: number
    // Null for an account with no bank connection.
    connectionId: string | null
    reviewCount: number
}

export interface BankAccountsModel {
    isEmpty: boolean
    // At most six rows.
    rows: BankRow[]
    moreCount: number
}

export interface ProfitAndLossModel {
    isEmpty: boolean
    period: PeriodId
    netProfit: number
    income: number
    expenses: number
    // Null when the same period one year earlier has no figure.
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

export type Loadable<T> =
    | { status: 'ready'; model: T }
    | { status: 'loading' }
    | { status: 'error' }

export interface DashboardWidgets {
    invoices: Loadable<InvoicesModel>
    expenses: Loadable<ExpensesModel>
    bankAccounts: Loadable<BankAccountsModel>
    profitAndLoss: Loadable<ProfitAndLossModel>
    sales: Loadable<SalesModel>
}

export interface DashboardState {
    prefs: DashboardPrefs
    prefsStatus: 'ready' | 'loading' | 'error'
    isEditing: boolean
    canWrite: boolean
    // False when the user cannot open the shipped reports: the report links are absent.
    canOpenReports: boolean
    widgets: DashboardWidgets
}

const INVOICES: InvoicesModel = {
    isEmpty: false,
    unpaid: 894000,
    overdue: 276000,
    notDue: 618000,
    overdueCount: 3,
    paidLast30Days: 1241500,
    waitingToDeposit: 185000,
}

// 6200 holds its sub-account 6210 Design Tools; 6900 Old Petty Cash is the fifth
// account with an amount, so it is the "Everything else" row.
const EXPENSES: ExpensesModel = {
    isEmpty: false,
    period: 'this_fiscal_year',
    total: 2120000,
    rows: [
        { key: '6100', label: '6100 Rent', amount: 1045000, share: 1, isEverythingElse: false },
        {
            key: '6200',
            label: '6200 Software Subscriptions',
            amount: 605000,
            share: 0.58,
            isEverythingElse: false,
        },
        {
            key: '6050',
            label: '6050 Bad debts',
            amount: 290000,
            share: 0.28,
            isEverythingElse: false,
        },
        {
            key: '6300',
            label: '6300 Bank charges and fees',
            amount: 155000,
            share: 0.15,
            isEverythingElse: false,
        },
        {
            key: 'rest',
            label: 'Everything else',
            amount: 25000,
            share: 0.02,
            isEverythingElse: true,
        },
    ],
}

const BANK_ACCOUNTS: BankAccountsModel = {
    isEmpty: false,
    rows: [
        {
            accountId: 'dashacct0001000',
            label: '1000 Business Checking',
            balance: 5335000,
            connectionId: 'dashconn0001000',
            reviewCount: 12,
        },
        {
            accountId: 'dashacct0001010',
            label: '1010 Business Savings',
            balance: 1800000,
            connectionId: null,
            reviewCount: 0,
        },
        {
            accountId: 'dashacct0002100',
            label: '2100 Company Card',
            balance: 128410,
            connectionId: 'dashconn0002100',
            reviewCount: 4,
        },
    ],
    moreCount: 0,
}

// Income is 4000 Consulting Income (41,675.00) and 4900 Interest earned (125.00);
// expenses is the Expenses widget's total for the same period.
const PROFIT_AND_LOSS: ProfitAndLossModel = {
    isEmpty: false,
    period: 'this_fiscal_year',
    netProfit: 2060000,
    income: 4180000,
    expenses: 2120000,
    change: { direction: 'down', percent: 59 },
}

const SALES: SalesModel = {
    isEmpty: false,
    period: 'last_6_months',
    total: 4435000,
    months: [
        { month: '2026-06-01', shortLabel: 'Jun', longLabel: 'Jun 2026', amount: 520000 },
        { month: '2026-07-01', shortLabel: 'Jul', longLabel: 'Jul 2026', amount: 715000 },
        { month: '2026-08-01', shortLabel: 'Aug', longLabel: 'Aug 2026', amount: 440000 },
        { month: '2026-09-01', shortLabel: 'Sep', longLabel: 'Sep 2026', amount: 1150000 },
        { month: '2026-10-01', shortLabel: 'Oct', longLabel: 'Oct 2026', amount: 820000 },
        { month: '2026-11-01', shortLabel: 'Nov', longLabel: 'Nov 2026', amount: 790000 },
    ],
}

function ready<T>(model: T): Loadable<T> {
    return { status: 'ready', model }
}

const POPULATED_WIDGETS: DashboardWidgets = {
    invoices: ready(INVOICES),
    expenses: ready(EXPENSES),
    bankAccounts: ready(BANK_ACCOUNTS),
    profitAndLoss: ready(PROFIT_AND_LOSS),
    sales: ready(SALES),
}

const POPULATED: DashboardState = {
    prefs: DEFAULT_DASHBOARD_PREFS,
    prefsStatus: 'ready',
    isEditing: false,
    canWrite: true,
    canOpenReports: true,
    widgets: POPULATED_WIDGETS,
}

const EMPTY_WIDGETS: DashboardWidgets = {
    invoices: ready({
        isEmpty: true,
        unpaid: 0,
        overdue: 0,
        notDue: 0,
        overdueCount: 0,
        paidLast30Days: 0,
        waitingToDeposit: 0,
    }),
    expenses: ready({ isEmpty: true, period: 'this_fiscal_year', total: 0, rows: [] }),
    bankAccounts: ready({ isEmpty: true, rows: [], moreCount: 0 }),
    profitAndLoss: ready({
        isEmpty: true,
        period: 'this_fiscal_year',
        netProfit: 0,
        income: 0,
        expenses: 0,
        change: null,
    }),
    sales: ready({ isEmpty: true, period: 'last_6_months', total: 0, months: [] }),
}

// Long names, nine-figure amounts, a loss, an overdrawn account, eight bank accounts
// (six rows and "2 more accounts"), twelve months with a zero and a negative month,
// no overdue invoice and nothing waiting to deposit, no comparison figure.
const LONG_WIDGETS: DashboardWidgets = {
    invoices: ready({
        isEmpty: false,
        unpaid: 123456789,
        overdue: 0,
        notDue: 123456789,
        overdueCount: 0,
        paidLast30Days: 987654321,
        waitingToDeposit: 0,
    }),
    expenses: ready({
        isEmpty: false,
        period: 'last_fiscal_year',
        total: 248913578,
        rows: [
            {
                key: '6400',
                label: '6400 Professional services, legal and accounting fees for outside counsel',
                amount: 123456789,
                share: 1,
                isEverythingElse: false,
            },
            {
                key: '6500',
                label: '6500 Payroll expenses and employer contributions',
                amount: 98765432,
                share: 0.8,
                isEverythingElse: false,
            },
            {
                key: '6100',
                label: '6100 Rent',
                amount: 14400000,
                share: 0.12,
                isEverythingElse: false,
            },
            {
                key: '6200',
                label: '6200 Software Subscriptions',
                amount: 9876543,
                share: 0.08,
                isEverythingElse: false,
            },
            {
                key: 'rest',
                label: 'Everything else',
                amount: 2414814,
                share: 0.02,
                isEverythingElse: true,
            },
        ],
    }),
    bankAccounts: ready({
        isEmpty: false,
        rows: [
            {
                accountId: 'dashacct0001000',
                label: '1000 Business Checking',
                balance: -4521000,
                connectionId: 'dashconn0001000',
                reviewCount: 1,
            },
            {
                accountId: 'dashacct0001010',
                label: '1010 Business Savings',
                balance: 987654321,
                connectionId: null,
                reviewCount: 0,
            },
            {
                accountId: 'dashacct0001020',
                label: '1020 Payroll clearing and tax reserve account, northern region',
                balance: 1800000,
                connectionId: 'dashconn0001020',
                reviewCount: 148,
            },
            {
                accountId: 'dashacct0001030',
                label: '1030 Money Market',
                balance: 25000000,
                connectionId: null,
                reviewCount: 0,
            },
            {
                accountId: 'dashacct0001040',
                label: '1040 Petty Cash Drawer',
                balance: 15000,
                connectionId: null,
                reviewCount: 0,
            },
            {
                accountId: 'dashacct0002100',
                label: '2100 Company Card',
                balance: 128410,
                connectionId: 'dashconn0002100',
                reviewCount: 4,
            },
        ],
        moreCount: 2,
    }),
    profitAndLoss: ready({
        isEmpty: false,
        period: 'last_fiscal_year',
        netProfit: -123456789,
        income: 125456789,
        expenses: 248913578,
        change: null,
    }),
    sales: ready({
        isEmpty: false,
        period: 'last_12_months',
        total: 125331789,
        months: [
            { month: '2025-12-01', shortLabel: 'Dec', longLabel: 'Dec 2025', amount: 9800000 },
            { month: '2026-01-01', shortLabel: 'Jan', longLabel: 'Jan 2026', amount: 0 },
            { month: '2026-02-01', shortLabel: 'Feb', longLabel: 'Feb 2026', amount: -125000 },
            { month: '2026-03-01', shortLabel: 'Mar', longLabel: 'Mar 2026', amount: 4200000 },
            { month: '2026-04-01', shortLabel: 'Apr', longLabel: 'Apr 2026', amount: 12400000 },
            { month: '2026-05-01', shortLabel: 'May', longLabel: 'May 2026', amount: 8750000 },
            { month: '2026-06-01', shortLabel: 'Jun', longLabel: 'Jun 2026', amount: 15600000 },
            { month: '2026-07-01', shortLabel: 'Jul', longLabel: 'Jul 2026', amount: 21456789 },
            { month: '2026-08-01', shortLabel: 'Aug', longLabel: 'Aug 2026', amount: 6100000 },
            { month: '2026-09-01', shortLabel: 'Sep', longLabel: 'Sep 2026', amount: 18250000 },
            { month: '2026-10-01', shortLabel: 'Oct', longLabel: 'Oct 2026', amount: 16400000 },
            { month: '2026-11-01', shortLabel: 'Nov', longLabel: 'Nov 2026', amount: 12500000 },
        ],
    }),
}

const LOADING_WIDGETS: DashboardWidgets = {
    invoices: { status: 'loading' },
    expenses: { status: 'loading' },
    bankAccounts: { status: 'loading' },
    profitAndLoss: { status: 'loading' },
    sales: { status: 'loading' },
}

// Widgets load and fail on their own: two failed, three drawn.
const ERROR_WIDGETS: DashboardWidgets = {
    ...POPULATED_WIDGETS,
    bankAccounts: { status: 'error' },
    profitAndLoss: { status: 'error' },
}

// One key per `?state=` of the reference route.
export const DASHBOARD_STATES = {
    populated: POPULATED,
    'hidden-amounts': {
        ...POPULATED,
        prefs: { ...DEFAULT_DASHBOARD_PREFS, hideAmounts: true },
    },
    // The user moved Bank accounts first and hid Sales.
    edit: {
        ...POPULATED,
        isEditing: true,
        prefs: {
            ...DEFAULT_DASHBOARD_PREFS,
            order: ['bankAccounts', 'invoices', 'expenses', 'profitAndLoss', 'sales'],
            hidden: ['sales'],
        },
    },
    reordered: {
        ...POPULATED,
        prefs: {
            ...DEFAULT_DASHBOARD_PREFS,
            order: ['bankAccounts', 'invoices', 'expenses', 'profitAndLoss', 'sales'],
            hidden: ['sales'],
        },
    },
    'all-hidden': {
        ...POPULATED,
        prefs: { ...DEFAULT_DASHBOARD_PREFS, hidden: [...WIDGET_IDS] },
    },
    empty: { ...POPULATED, widgets: EMPTY_WIDGETS },
    // A reader: no create button, no deposit link; no shipped report shared with them.
    'empty-read-only': {
        ...POPULATED,
        canWrite: false,
        canOpenReports: false,
        widgets: EMPTY_WIDGETS,
    },
    'read-only': { ...POPULATED, canWrite: false, canOpenReports: false },
    loading: { ...POPULATED, prefsStatus: 'loading', widgets: LOADING_WIDGETS },
    error: { ...POPULATED, widgets: ERROR_WIDGETS },
    'prefs-error': { ...POPULATED, prefsStatus: 'error' },
    long: {
        ...POPULATED,
        prefs: {
            ...DEFAULT_DASHBOARD_PREFS,
            periods: {
                profitAndLoss: 'last_fiscal_year',
                expenses: 'last_fiscal_year',
                sales: 'last_12_months',
            },
        },
        widgets: LONG_WIDGETS,
    },
} satisfies Record<string, DashboardState>

export type DashboardStateName = keyof typeof DASHBOARD_STATES
