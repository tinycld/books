// Synthetic data for the setup wizard helix reference route and, later, the seed.
// Typed against the generated record types so tsc checks every field.
import type { BooksAccounts, BooksSettings } from '../types'
import { ACCOUNTS } from './chart-of-accounts-fixture'
import { type Ownership, starterChart } from './starter-chart'

export type ChartAccount = BooksAccounts

export const LONG_BUSINESS_NAME =
    'Northwind Regional Wholesale Distribution and Logistics Partners of the Greater Pacific Northwest, Incorporated'

export const FRESH_SETTINGS: BooksSettings = {
    id: 'bookssettings01',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: '',
    // PocketBase stores an unset select as '', which the generated type omits.
    ownership: '' as BooksSettings['ownership'],
    setup_completed: false,
    created: '2026-10-01 00:00:00.000Z',
    updated: '2026-10-01 00:00:00.000Z',
}

export const DONE_SETTINGS: BooksSettings = {
    ...FRESH_SETTINGS,
    fiscal_year_start_month: 7,
    business_name: 'Small Business Builders, LLC',
    ownership: 'owners',
    setup_completed: true,
}

const STAMP = '2026-10-01 00:00:00.000Z'

function seedId(number: string): string {
    return `strt${number.padStart(11, '0')}`
}

function build(ownership: Ownership): BooksAccounts[] {
    const chart = starterChart(ownership)
    const numberOfKey = new Map(chart.map(item => [item.key, item.number]))
    return chart.map(item => {
        const parentNumber = item.parent ? numberOfKey.get(item.parent) : undefined
        return {
            id: seedId(item.number),
            number: item.number,
            name: item.name,
            type: item.type as BooksAccounts['type'],
            detail_type: item.detail_type,
            description: '',
            inactive: false,
            parent: parentNumber ? seedId(parentNumber) : '',
            currency: 'USD',
            created: STAMP,
            updated: STAMP,
        }
    })
}

export const STARTER_CHART: Record<Ownership, BooksAccounts[]> = {
    owners: build('owners'),
    corporation: build('corporation'),
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
