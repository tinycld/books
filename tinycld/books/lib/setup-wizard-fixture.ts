// Synthetic data for the setup wizard helix reference route and, later, the seed.
// Typed against the generated record types so tsc checks every field.
import type { BooksAccounts, BooksSettings } from '../types'
import { ACCOUNTS } from './chart-of-accounts-fixture'

// The migration checkpoint (it edits 2100000001_create_books_settings.js to add
// business_name and setup_completed) must replace this interface with the
// generated BooksSettings and delete SetupSettings.
export interface SetupSettings extends BooksSettings {
    business_name: string
    setup_completed: boolean
}

export type Ownership = 'owners' | 'corporation'
export type ChartAccount = BooksAccounts

export const LONG_BUSINESS_NAME =
    'Northwind Regional Wholesale Distribution and Logistics Partners of the Greater Pacific Northwest, Incorporated'

export const FRESH_SETTINGS: SetupSettings = {
    id: 'bookssettings01',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: '',
    setup_completed: false,
    created: '2026-10-01 00:00:00.000Z',
    updated: '2026-10-01 00:00:00.000Z',
}

export const DONE_SETTINGS: SetupSettings = {
    ...FRESH_SETTINGS,
    fiscal_year_start_month: 7,
    business_name: 'Small Business Builders, LLC',
    setup_completed: true,
}

export const FISCAL_MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const

export const OWNERSHIP_CHOICES = [
    {
        value: 'owners' as const,
        label: 'One owner or partners',
        description: "Owner's equity, Owner's contributions, Owner's draws",
    },
    {
        value: 'corporation' as const,
        label: 'Corporation',
        description: 'Common stock, Paid-in capital, Retained earnings, Dividends paid',
    },
]

type ChartSeed = Pick<BooksAccounts, 'name' | 'number' | 'type' | 'detail_type'> & {
    parentNumber?: string
}

function seedId(number: string): string {
    return `strt${number.padStart(11, '0')}`
}

function build(seeds: ChartSeed[]): BooksAccounts[] {
    return seeds.map(({ parentNumber, ...seed }) => ({
        id: seedId(seed.number),
        description: '',
        inactive: false,
        parent: parentNumber ? seedId(parentNumber) : '',
        currency: 'USD',
        created: '2026-10-01 00:00:00.000Z',
        updated: '2026-10-01 00:00:00.000Z',
        ...seed,
    }))
}

const SHARED_BEFORE_EQUITY: ChartSeed[] = [
    { number: '1000', name: 'Cash and bank', type: 'bank', detail_type: 'cash_on_hand' },
    {
        number: '1010',
        name: 'Business checking',
        type: 'bank',
        detail_type: 'checking',
        parentNumber: '1000',
    },
    {
        number: '1020',
        name: 'Business savings',
        type: 'bank',
        detail_type: 'savings',
        parentNumber: '1000',
    },
    {
        number: '1100',
        name: 'Accounts receivable',
        type: 'accounts_receivable',
        detail_type: 'accounts_receivable',
    },
    {
        number: '1200',
        name: 'Undeposited funds',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
    },
    {
        number: '1300',
        name: 'Prepaid expenses',
        type: 'other_current_asset',
        detail_type: 'prepaid_expenses',
    },
    {
        number: '1500',
        name: 'Equipment',
        type: 'fixed_asset',
        detail_type: 'machinery_equipment',
    },
    {
        number: '1590',
        name: 'Accumulated depreciation',
        type: 'fixed_asset',
        detail_type: 'accumulated_depreciation',
    },
    {
        number: '1900',
        name: 'Security deposits',
        type: 'other_asset',
        detail_type: 'security_deposits',
    },
    {
        number: '2000',
        name: 'Accounts payable',
        type: 'accounts_payable',
        detail_type: 'accounts_payable',
    },
    { number: '2100', name: 'Credit card', type: 'credit_card', detail_type: 'credit_card' },
    {
        number: '2200',
        name: 'Sales tax payable',
        type: 'other_current_liability',
        detail_type: 'sales_tax_payable',
    },
    {
        number: '2300',
        name: 'Payroll liabilities',
        type: 'other_current_liability',
        detail_type: 'payroll_liabilities',
    },
    {
        number: '2400',
        name: 'Line of credit',
        type: 'other_current_liability',
        detail_type: 'line_of_credit',
    },
    {
        number: '2700',
        name: 'Notes payable',
        type: 'long_term_liability',
        detail_type: 'notes_payable',
    },
]

const OWNERS_EQUITY: ChartSeed[] = [
    { number: '3000', name: "Owner's equity", type: 'equity', detail_type: 'owners_equity' },
    {
        number: '3100',
        name: "Owner's contributions",
        type: 'equity',
        detail_type: 'partner_contributions',
    },
    { number: '3200', name: "Owner's draws", type: 'equity', detail_type: 'owner_draws' },
]

// The detail types have no "dividends" entry; Dividends paid files under
// retained_earnings until the chart-of-accounts types gain one.
const CORPORATION_EQUITY: ChartSeed[] = [
    { number: '3000', name: 'Common stock', type: 'equity', detail_type: 'common_stock' },
    { number: '3100', name: 'Paid-in capital', type: 'equity', detail_type: 'paid_in_capital' },
    { number: '3200', name: 'Retained earnings', type: 'equity', detail_type: 'retained_earnings' },
    { number: '3300', name: 'Dividends paid', type: 'equity', detail_type: 'retained_earnings' },
]

const SHARED_AFTER_EQUITY: ChartSeed[] = [
    { number: '4000', name: 'Service income', type: 'income', detail_type: 'service_income' },
    { number: '4100', name: 'Product sales', type: 'income', detail_type: 'product_sales' },
    {
        number: '4200',
        name: 'Discounts and refunds given',
        type: 'income',
        detail_type: 'discounts_refunds',
    },
    {
        number: '4900',
        name: 'Interest earned',
        type: 'other_income',
        detail_type: 'interest_earned',
    },
    {
        number: '5000',
        name: 'Cost of goods sold',
        type: 'cost_of_goods_sold',
        detail_type: 'supplies_materials',
    },
    {
        number: '6000',
        name: 'Advertising and marketing',
        type: 'expense',
        detail_type: 'advertising_marketing',
    },
    { number: '6100', name: 'Bank charges and fees', type: 'expense', detail_type: 'bank_charges' },
    { number: '6200', name: 'Insurance', type: 'expense', detail_type: 'insurance' },
    {
        number: '6300',
        name: 'Legal and professional fees',
        type: 'expense',
        detail_type: 'legal_professional',
    },
    { number: '6400', name: 'Office and general', type: 'expense', detail_type: 'office_general' },
    { number: '6500', name: 'Payroll expenses', type: 'expense', detail_type: 'payroll_expenses' },
    { number: '6600', name: 'Rent or lease', type: 'expense', detail_type: 'rent_lease' },
    {
        number: '6700',
        name: 'Repairs and maintenance',
        type: 'expense',
        detail_type: 'repairs_maintenance',
    },
    { number: '6800', name: 'Taxes and licenses', type: 'expense', detail_type: 'taxes_licenses' },
    { number: '6900', name: 'Utilities', type: 'expense', detail_type: 'utilities' },
    { number: '7000', name: 'Depreciation', type: 'other_expense', detail_type: 'depreciation' },
]

export const STARTER_CHART: Record<Ownership, BooksAccounts[]> = {
    owners: build([...SHARED_BEFORE_EQUITY, ...OWNERS_EQUITY, ...SHARED_AFTER_EQUITY]),
    corporation: build([...SHARED_BEFORE_EQUITY, ...CORPORATION_EQUITY, ...SHARED_AFTER_EQUITY]),
}

export const CHART_GROUPS = [
    { key: 'asset', label: 'Assets' },
    { key: 'liability', label: 'Liabilities' },
    { key: 'equity', label: 'Equity' },
    { key: 'income', label: 'Income' },
    { key: 'expense', label: 'Expenses' },
] as const

// Which group an account type files under; mirrors server/account_types.json.
export const GROUP_OF_TYPE: Record<BooksAccounts['type'], (typeof CHART_GROUPS)[number]['key']> = {
    bank: 'asset',
    accounts_receivable: 'asset',
    other_current_asset: 'asset',
    fixed_asset: 'asset',
    other_asset: 'asset',
    accounts_payable: 'liability',
    credit_card: 'liability',
    other_current_liability: 'liability',
    long_term_liability: 'liability',
    equity: 'equity',
    income: 'income',
    other_income: 'income',
    cost_of_goods_sold: 'expense',
    expense: 'expense',
    other_expense: 'expense',
}

// The batch stopped here: the server refused this account and said why.
export const REFUSED_ACCOUNT = {
    number: '1200',
    name: 'Undeposited funds',
    message: 'An account numbered 1200 already exists.',
    createdBeforeRefusal: 7,
}

// A book that already has accounts when the step opens.
export const POPULATED_ACCOUNT_COUNT = ACCOUNTS.length
