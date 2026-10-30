// The accounts of the seeded e2e book (seed.ts). They live here, not in
// seed.ts, so the vendor fixture can check its account numbers against them
// without an import cycle. `parent` is another account's key; an `inactive`
// account is created active and made inactive after the rows that name it.

import type { BooksAccounts } from '../types'

export type SeedAccount = {
    key: string
    name: string
    number: string
    type: BooksAccounts['type']
    detail_type: string
    parent?: string
    inactive?: boolean
}

export const SEED_ACCOUNTS: SeedAccount[] = [
    {
        key: 'checking',
        name: 'Business Checking',
        number: '1000',
        type: 'bank',
        detail_type: 'checking',
    },
    {
        key: 'receivable',
        name: 'Accounts receivable',
        number: '1100',
        type: 'accounts_receivable',
        detail_type: 'accounts_receivable',
    },
    {
        key: 'equipment',
        name: 'Office Equipment',
        number: '1500',
        type: 'fixed_asset',
        detail_type: 'machinery_equipment',
    },
    {
        key: 'card',
        name: 'Company Card',
        number: '2100',
        type: 'credit_card',
        detail_type: 'credit_card',
    },
    {
        key: 'equity',
        name: "Owner's Equity",
        number: '3000',
        type: 'equity',
        detail_type: 'owners_equity',
    },
    {
        key: 'consulting',
        name: 'Consulting Income',
        number: '4000',
        type: 'income',
        detail_type: 'service_income',
    },
    { key: 'rent', name: 'Rent', number: '6100', type: 'expense', detail_type: 'rent_lease' },
    {
        key: 'software',
        name: 'Software Subscriptions',
        number: '6200',
        type: 'expense',
        detail_type: 'dues_subscriptions',
    },
    {
        key: 'design-tools',
        name: 'Design Tools',
        number: '6210',
        type: 'expense',
        detail_type: 'dues_subscriptions',
        parent: 'software',
    },
    {
        key: 'petty',
        name: 'Old Petty Cash',
        number: '6900',
        type: 'other_expense',
        detail_type: 'other_misc_expense',
        inactive: true,
    },
]
