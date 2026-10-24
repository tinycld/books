import type { BooksAccounts } from '../types'
import { ACCOUNT_TYPES, type AccountGroup } from './account-types'

export type Ownership = 'owners' | 'corporation'

export interface StarterAccount {
    key: string
    number: string
    name: string
    type: BooksAccounts['type']
    detail_type: string
    parent?: string
}

export const STARTER_GROUPS: {
    key: 'assets' | 'liabilities' | 'equity' | 'income' | 'expenses'
    label: string
}[] = [
    { key: 'assets', label: 'Assets' },
    { key: 'liabilities', label: 'Liabilities' },
    { key: 'equity', label: 'Equity' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
]

const GROUP_KEY: Record<AccountGroup, (typeof STARTER_GROUPS)[number]['key']> = {
    asset: 'assets',
    liability: 'liabilities',
    equity: 'equity',
    income: 'income',
    expense: 'expenses',
}

function account(
    number: string,
    name: string,
    type: BooksAccounts['type'],
    detail_type: string,
    parent?: string
): StarterAccount {
    return { key: `a${number}`, number, name, type, detail_type, parent }
}

const ASSETS_AND_LIABILITIES: StarterAccount[] = [
    account('1000', 'Cash and bank', 'bank', 'cash_on_hand'),
    account('1010', 'Business checking', 'bank', 'checking', 'a1000'),
    account('1020', 'Business savings', 'bank', 'savings', 'a1000'),
    account('1100', 'Accounts receivable', 'accounts_receivable', 'accounts_receivable'),
    account('1200', 'Undeposited funds', 'other_current_asset', 'undeposited_funds'),
    account('1300', 'Prepaid expenses', 'other_current_asset', 'prepaid_expenses'),
    account('1500', 'Equipment', 'fixed_asset', 'machinery_equipment'),
    account('1590', 'Accumulated depreciation', 'fixed_asset', 'accumulated_depreciation'),
    account('1900', 'Security deposits', 'other_asset', 'security_deposits'),
    account('2000', 'Accounts payable', 'accounts_payable', 'accounts_payable'),
    account('2100', 'Credit card', 'credit_card', 'credit_card'),
    account('2200', 'Sales tax payable', 'other_current_liability', 'sales_tax_payable'),
    account('2300', 'Payroll liabilities', 'other_current_liability', 'payroll_liabilities'),
    account('2400', 'Line of credit', 'other_current_liability', 'line_of_credit'),
    account('2700', 'Notes payable', 'long_term_liability', 'notes_payable'),
]

const EQUITY: Record<Ownership, StarterAccount[]> = {
    owners: [
        account('3000', "Owner's equity", 'equity', 'owners_equity'),
        account('3100', "Owner's contributions", 'equity', 'partner_contributions'),
        account('3200', "Owner's draws", 'equity', 'owner_draws'),
    ],
    corporation: [
        account('3300', 'Common stock', 'equity', 'common_stock'),
        account('3400', 'Paid-in capital', 'equity', 'paid_in_capital'),
        account('3500', 'Retained earnings', 'equity', 'retained_earnings'),
    ],
}

const INCOME_AND_EXPENSES: StarterAccount[] = [
    account('4000', 'Service income', 'income', 'service_income'),
    account('4100', 'Product sales', 'income', 'product_sales'),
    account('4200', 'Discounts and refunds given', 'income', 'discounts_refunds'),
    account('4900', 'Interest earned', 'other_income', 'interest_earned'),
    account('5000', 'Cost of goods sold', 'cost_of_goods_sold', 'supplies_materials'),
    account('6000', 'Advertising and marketing', 'expense', 'advertising_marketing'),
    account('6100', 'Bank charges and fees', 'expense', 'bank_charges'),
    account('6200', 'Insurance', 'expense', 'insurance'),
    account('6300', 'Legal and professional fees', 'expense', 'legal_professional'),
    account('6400', 'Office and general', 'expense', 'office_general'),
    account('6500', 'Payroll expenses', 'expense', 'payroll_expenses'),
    account('6600', 'Rent or lease', 'expense', 'rent_lease'),
    account('6700', 'Repairs and maintenance', 'expense', 'repairs_maintenance'),
    account('6800', 'Taxes and licenses', 'expense', 'taxes_licenses'),
    account('6900', 'Utilities', 'expense', 'utilities'),
    account('6950', 'Depreciation', 'other_expense', 'depreciation'),
]

export function starterChart(ownership: Ownership): StarterAccount[] {
    return [...ASSETS_AND_LIABILITIES, ...EQUITY[ownership], ...INCOME_AND_EXPENSES]
}

export function groupStarterChart(accounts: readonly StarterAccount[]) {
    const groupOfType = new Map(ACCOUNT_TYPES.map(def => [def.key, GROUP_KEY[def.group]]))
    return STARTER_GROUPS.map(group => {
        const inGroup = accounts.filter(item => groupOfType.get(item.type) === group.key)
        return { key: group.key, label: group.label, accounts: inGroup, count: inGroup.length }
    })
}

// Corporation equity numbers differ from the owners ones so that the accounts
// already created tell a half-done book's ownership.
export function inferOwnership(existingNumbers: ReadonlySet<string>): Ownership {
    const ownerNumbers = new Set(EQUITY.owners.map(item => item.number))
    const isCorporation = EQUITY.corporation.some(
        item => !ownerNumbers.has(item.number) && existingNumbers.has(item.number)
    )
    return isCorporation ? 'corporation' : 'owners'
}

function equitySummary(ownership: Ownership): string {
    return EQUITY[ownership].map(item => item.name).join(', ')
}

export const OWNERSHIP_CHOICES: { value: Ownership; title: string; summary: string }[] = [
    { value: 'owners', title: 'One owner or partners', summary: equitySummary('owners') },
    { value: 'corporation', title: 'Corporation', summary: equitySummary('corporation') },
]
