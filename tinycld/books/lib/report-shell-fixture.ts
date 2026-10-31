// Synthetic reports for the report shell helix reference route and the unit tests.
// Accounts and settings are typed against the generated record types, and the reports
// against the report contract, so tsc checks every field. Money is integer cents.
import type { BooksAccounts, BooksSettings } from '../types'
import {
    DEFAULT_NUMBER_FORMAT,
    type FilterSpec,
    type ReportColumn,
    type ReportModel,
    type ReportModelRow,
    type ReportNumberFormat,
    type ReportOptions,
    type ReportSpec,
    type RowsChoice,
} from './report-definition'
import { AS_OF_PRESET_IDS, PERIOD_PRESET_LABELS, RANGE_PRESET_IDS } from './report-period'
import type { ReportEntry } from './report-registry'

export { DEFAULT_NUMBER_FORMAT } from './report-definition'
export { ACCOUNT_GROUP_CHOICES } from './report-filters'
export { REPORT_SECTIONS } from './report-registry'

// "Today" for the reference captures, so the presets resolve to stable dates.
export const REPORT_TODAY = '2026-10-25'

export const REPORT_SETTINGS = {
    id: 'settings_rpt1',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: 'Harbor Lane Design LLC',
    ownership: 'owners',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    setup_started: true,
    setup_completed: true,
    threshold_1099: 200000,
    created: '2026-01-01 00:00:00.000Z',
    updated: '2026-01-01 00:00:00.000Z',
} satisfies BooksSettings

// The registry as later units fill it in: most sections have an available report, and
// Taxes has none, so the hub must not draw it.
export const HUB_ENTRIES: ReportEntry[] = [
    {
        id: 'profit-and-loss',
        title: 'Profit and Loss',
        description: 'Income, expenses and net income for a period',
        section: 'business-overview',
        available: true,
    },
    {
        id: 'balance-sheet',
        title: 'Balance Sheet',
        description: 'What the business owns, what it owes, and its equity on a date',
        section: 'business-overview',
        available: true,
    },
    {
        id: 'trial-balance',
        title: 'Trial Balance',
        description: 'Debit and credit balance of every account on a date',
        section: 'accountant',
        available: true,
    },
    {
        id: 'general-ledger',
        title: 'General Ledger',
        description: 'Every posted line, grouped by account, for a period',
        section: 'accountant',
        available: true,
    },
    {
        id: 'journal',
        title: 'Journal',
        description: 'Every posted entry with its lines, in date order',
        section: 'accountant',
        available: false,
    },
    {
        id: 'receivables-aging',
        title: 'Accounts receivable aging',
        description: 'Unpaid invoices by how long they are overdue',
        section: 'who-owes-you',
        available: true,
    },
    {
        id: 'payables-aging',
        title: 'Accounts payable aging',
        description: 'Unpaid bills by how long they are overdue',
        section: 'what-you-owe',
        available: true,
    },
    {
        id: 'sales-by-customer',
        title: 'Sales by customer',
        description: 'Income per customer for a period',
        section: 'sales',
        available: true,
    },
    {
        id: 'expenses-by-vendor',
        title: 'Expenses by vendor',
        description:
            'Spending per vendor for a period, with the bills, expenses and checks that make up each total',
        section: 'expenses',
        available: true,
    },
    {
        id: 'sales-tax-liability',
        title: 'Sales tax liability',
        description: 'Sales tax collected and owed per agency',
        section: 'taxes',
        available: false,
    },
]

// The registry as this unit ships it: only the Trial Balance is available.
export const HUB_ENTRIES_V0: ReportEntry[] = HUB_ENTRIES.map(entry => ({
    ...entry,
    available: entry.id === 'trial-balance',
}))

export const HUB_ENTRIES_NONE: ReportEntry[] = HUB_ENTRIES.map(entry => ({
    ...entry,
    available: false,
}))

function account(
    id: string,
    number: string,
    name: string,
    type: BooksAccounts['type'],
    detail_type: string
): BooksAccounts {
    return {
        id,
        number,
        name,
        type,
        detail_type,
        description: '',
        inactive: false,
        form_1099_box: '',
        currency: 'USD',
        parent: '',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

// Chart order. One name is long enough to truncate in the label column.
export const REPORT_ACCOUNTS: BooksAccounts[] = [
    account('rpt_acct_1010', '1010', 'Operating checking', 'bank', 'checking'),
    account('rpt_acct_1020', '1020', 'Reserve savings', 'bank', 'savings'),
    account(
        'rpt_acct_1200',
        '1200',
        'Accounts receivable',
        'accounts_receivable',
        'accounts_receivable'
    ),
    account(
        'rpt_acct_1500',
        '1500',
        'Office equipment and furniture for the Harbor Lane studio renovation',
        'fixed_asset',
        'furniture_and_fixtures'
    ),
    account(
        'rpt_acct_1510',
        '1510',
        'Accumulated depreciation',
        'fixed_asset',
        'accumulated_depreciation'
    ),
    account('rpt_acct_2000', '2000', 'Accounts payable', 'accounts_payable', 'accounts_payable'),
    account('rpt_acct_2100', '2100', 'Business credit card', 'credit_card', 'credit_card'),
    account(
        'rpt_acct_2400',
        '2400',
        'Sales tax payable',
        'other_current_liability',
        'sales_tax_payable'
    ),
    account('rpt_acct_3000', '3000', "Owner's investment", 'equity', 'owners_equity'),
    account('rpt_acct_3900', '3900', 'Retained earnings', 'equity', 'retained_earnings'),
    account('rpt_acct_4000', '4000', 'Consulting income', 'income', 'service_fee_income'),
    account('rpt_acct_4100', '4100', 'Product sales', 'income', 'sales_of_product_income'),
    account('rpt_acct_4200', '4200', 'Workshop fees', 'income', 'service_fee_income'),
    account(
        'rpt_acct_5000',
        '5000',
        'Cost of goods sold',
        'cost_of_goods_sold',
        'supplies_materials_cogs'
    ),
    account('rpt_acct_6000', '6000', 'Rent', 'expense', 'rent_or_lease_of_buildings'),
    account(
        'rpt_acct_6100',
        '6100',
        'Software subscriptions',
        'expense',
        'office_general_administrative_expenses'
    ),
    account('rpt_acct_6200', '6200', 'Travel', 'expense', 'travel'),
    account('rpt_acct_6300', '6300', 'Bank charges', 'expense', 'bank_charges'),
    account('rpt_acct_6500', '6500', 'Contract labor', 'expense', 'cost_of_labor'),
    account(
        'rpt_acct_6900',
        '6900',
        'Charitable contributions',
        'expense',
        'charitable_contributions'
    ),
]

// Positive is a debit balance, negative a credit balance. 6900 has no balance, so the
// Non-zero rows default leaves it out.
const TRIAL_BALANCES: Record<string, number> = {
    rpt_acct_1010: 4_852_640,
    rpt_acct_1020: 2_500_000,
    rpt_acct_1200: 1_284_500,
    rpt_acct_1500: 1_875_000,
    rpt_acct_1510: -312_500,
    rpt_acct_2000: -486_320,
    rpt_acct_2100: -129_875,
    rpt_acct_2400: -84_210,
    rpt_acct_3000: -3_000_000,
    rpt_acct_3900: -4_232_365,
    rpt_acct_4000: -4_342_500,
    rpt_acct_4100: -1_164_600,
    rpt_acct_4200: -324_000,
    rpt_acct_5000: 412_000,
    rpt_acct_6000: 1_620_000,
    rpt_acct_6100: 217_425,
    rpt_acct_6200: 358_025,
    rpt_acct_6300: 16_780,
    rpt_acct_6500: 940_000,
    rpt_acct_6900: 0,
}

const TRIAL_COLUMNS: ReportColumn[] = [
    { id: 'label', label: 'Account', kind: 'text' },
    { id: 'debit', label: 'Debit', kind: 'money' },
    { id: 'credit', label: 'Credit', kind: 'money' },
]

function trialBalanceModel(): ReportModel {
    const lines = REPORT_ACCOUNTS.filter(a => (TRIAL_BALANCES[a.id] ?? 0) !== 0)
    const details: ReportModelRow[] = lines.map(a => {
        const cents = TRIAL_BALANCES[a.id] ?? 0
        return {
            id: a.id,
            kind: 'detail',
            depth: 0,
            label: `${a.number} ${a.name}`,
            cells: { debit: cents > 0 ? cents : null, credit: cents < 0 ? -cents : null },
        }
    })
    const sum = (key: 'debit' | 'credit') =>
        details.reduce((total, row) => total + Number(row.cells[key] ?? 0), 0)
    const total: ReportModelRow = {
        id: 'total',
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { debit: sum('debit'), credit: sum('credit') },
    }
    return { columns: TRIAL_COLUMNS, rows: [...details, total] }
}

export const TRIAL_BALANCE_MODEL: ReportModel = trialBalanceModel()

export const EMPTY_MODEL: ReportModel = { columns: TRIAL_COLUMNS, rows: [] }

// Profit and Loss by quarter: the multi-section shape (sections, a nested section,
// subtotals, totals) with five amount columns, so the phone layout fixes the label column
// at 168pt and scrolls the amounts.
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const

const PL_COLUMNS: ReportColumn[] = [
    { id: 'label', label: 'Account', kind: 'text' },
    { id: 'q1', label: 'Jan – Mar 2026', kind: 'money' },
    { id: 'q2', label: 'Apr – Jun 2026', kind: 'money' },
    { id: 'q3', label: 'Jul – Sep 2026', kind: 'money' },
    { id: 'q4', label: 'Oct 1 – 25, 2026', kind: 'money' },
    { id: 'total', label: 'Total', kind: 'money' },
]

type Quarterly = readonly [number, number, number, number]

interface PlLine {
    id: string
    label: string
    amounts: Quarterly
}

interface PlSection {
    id: string
    label: string
    subtotalLabel: string
    lines: PlLine[]
    children?: PlSection[]
}

const PL_INCOME: PlSection = {
    id: 'income',
    label: 'Income',
    subtotalLabel: 'Total income',
    lines: [
        {
            id: '4000',
            label: '4000 Consulting income',
            amounts: [1_085_000, 1_240_000, 1_192_500, 825_000],
        },
        { id: '4100', label: '4100 Product sales', amounts: [298_000, 341_500, 317_100, 208_000] },
        { id: '4200', label: '4200 Workshop fees', amounts: [96_000, 0, 144_000, 84_000] },
    ],
}

const PL_COGS: PlSection = {
    id: 'cogs',
    label: 'Cost of goods sold',
    subtotalLabel: 'Total cost of goods sold',
    lines: [
        {
            id: '5000',
            label: '5000 Cost of goods sold',
            amounts: [101_000, 118_500, 112_300, 80_200],
        },
    ],
}

const PL_EXPENSES: PlSection = {
    id: 'expenses',
    label: 'Expenses',
    subtotalLabel: 'Total expenses',
    lines: [
        { id: '6000', label: '6000 Rent', amounts: [486_000, 486_000, 486_000, 162_000] },
        {
            id: '6100',
            label: '6100 Software subscriptions',
            amounts: [52_450, 61_800, 63_175, 40_000],
        },
        {
            id: '6200',
            label: '6200 Travel, lodging and conference registration for the annual partner summit',
            amounts: [0, 214_025, 98_000, 46_000],
        },
        { id: '6300', label: '6300 Bank charges', amounts: [4_210, 3_980, 5_120, 3_470] },
        { id: '6400', label: '6400 Refund adjustment', amounts: [0, -42_000, 0, 0] },
    ],
    children: [
        {
            id: 'professional-fees',
            label: 'Professional fees',
            subtotalLabel: 'Total professional fees',
            lines: [
                { id: '6510', label: '6510 Legal fees', amounts: [120_000, 0, 85_000, 0] },
                {
                    id: '6520',
                    label: '6520 Accounting fees',
                    amounts: [45_000, 45_000, 45_000, 15_000],
                },
            ],
        },
    ],
}

function cellsOf(amounts: Quarterly): Record<string, number> {
    const cells: Record<string, number> = {}
    QUARTERS.forEach((q, i) => {
        cells[q] = amounts[i]
    })
    cells.total = amounts.reduce((a, b) => a + b, 0)
    return cells
}

function sectionTotal(section: PlSection): Quarterly {
    const parts = [
        ...section.lines.map(l => l.amounts),
        ...(section.children ?? []).map(sectionTotal),
    ]
    const add = (i: number) => parts.reduce((total, p) => total + p[i], 0)
    return [add(0), add(1), add(2), add(3)]
}

function sectionRows(section: PlSection, depth: number, parent?: string): ReportModelRow[] {
    const head: ReportModelRow = {
        id: section.id,
        kind: 'section',
        depth,
        label: section.label,
        section: parent,
        cells: {},
    }
    const details: ReportModelRow[] = section.lines.map(line => ({
        id: `${section.id}:${line.id}`,
        kind: 'detail',
        depth: depth + 1,
        label: line.label,
        section: section.id,
        cells: cellsOf(line.amounts),
    }))
    const nested = (section.children ?? []).flatMap(child =>
        sectionRows(child, depth + 1, section.id)
    )
    const subtotal: ReportModelRow = {
        id: `${section.id}:subtotal`,
        kind: 'subtotal',
        depth,
        label: section.subtotalLabel,
        section: section.id,
        cells: cellsOf(sectionTotal(section)),
    }
    return [head, ...details, ...nested, subtotal]
}

function difference(a: Quarterly, b: Quarterly): Quarterly {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]]
}

function profitAndLossModel(): ReportModel {
    const grossProfit = difference(sectionTotal(PL_INCOME), sectionTotal(PL_COGS))
    const netIncome = difference(grossProfit, sectionTotal(PL_EXPENSES))
    const total = (id: string, label: string, amounts: Quarterly): ReportModelRow => ({
        id,
        kind: 'total',
        depth: 0,
        label,
        cells: cellsOf(amounts),
    })
    return {
        columns: PL_COLUMNS,
        rows: [
            ...sectionRows(PL_INCOME, 0),
            ...sectionRows(PL_COGS, 0),
            total('gross-profit', 'Gross profit', grossProfit),
            ...sectionRows(PL_EXPENSES, 0),
            total('net-income', 'Net income', netIncome),
        ],
    }
}

export const PROFIT_AND_LOSS_MODEL: ReportModel = profitAndLossModel()

export const PL_EMPTY_MODEL: ReportModel = { columns: PL_COLUMNS, rows: [] }

export const CUSTOM_NUMBER_FORMAT: ReportNumberFormat = {
    divideBy1000: false,
    withoutCents: true,
    negative: 'parens',
    negativeRed: true,
}

export const ACCOUNT_FILTER: FilterSpec = {
    id: 'account',
    label: 'Account',
    kind: 'accounts',
}

export const TRIAL_BALANCE_OPTIONS: ReportOptions = {
    period: { kind: 'as-of', preset: 'end-of-last-month', from: null, to: '2026-09-30' },
    basis: 'accrual',
    rows: 'non-zero',
    columnsBy: 'total',
    columns: [],
    filters: {},
    numberFormat: DEFAULT_NUMBER_FORMAT,
}

export const PROFIT_AND_LOSS_OPTIONS: ReportOptions = {
    period: {
        kind: 'range',
        preset: 'this-fiscal-year-to-date',
        from: '2026-01-01',
        to: '2026-10-25',
    },
    basis: 'accrual',
    rows: 'active',
    columnsBy: 'quarters',
    columns: [],
    filters: {},
    numberFormat: DEFAULT_NUMBER_FORMAT,
}

// Three accounts that had no activity this month: the "Clear filters" empty state.
export const FILTERED_EMPTY_OPTIONS: ReportOptions = {
    ...PROFIT_AND_LOSS_OPTIONS,
    period: { kind: 'range', preset: 'this-month', from: '2026-10-01', to: '2026-10-31' },
    filters: { account: ['rpt_acct_4200', 'rpt_acct_6500', 'rpt_acct_6900'] },
}

export const AS_OF_PRESETS = AS_OF_PRESET_IDS.map(id => ({ id, label: PERIOD_PRESET_LABELS[id] }))

export const RANGE_PRESETS = RANGE_PRESET_IDS.map(id => ({ id, label: PERIOD_PRESET_LABELS[id] }))

export const ROWS_CHOICES: { value: RowsChoice; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'non-zero', label: 'Non-zero' },
    { value: 'all', label: 'All' },
]

export const PL_COLUMNS_BY: NonNullable<ReportSpec['columnsBy']>['choices'] = [
    { value: 'total', label: 'Total only' },
    { value: 'months', label: 'Months' },
    { value: 'quarters', label: 'Quarters' },
]

export const PL_COLUMN_TOGGLES: NonNullable<ReportSpec['columnToggles']> = [
    { id: 'percent-of-income', label: '% of income' },
    { id: 'previous-year', label: 'Previous year' },
]
