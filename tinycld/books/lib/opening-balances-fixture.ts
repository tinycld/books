// Synthetic balance-sheet chart and opening amounts for the helix reference route and, later, the seed.
// Accounts are typed against the generated record types so tsc checks every field.
// Amounts are integer cents in the account's natural sign: an asset is a positive
// debit balance, a liability a positive credit balance, and a negative number is
// the opposite side (accumulated depreciation under Assets).
import type { BooksAccounts, BooksJournalEntries } from '../types'

type AccountSeed = Pick<BooksAccounts, 'id' | 'name' | 'type' | 'detail_type'> &
    Partial<Pick<BooksAccounts, 'number' | 'inactive' | 'parent'>>

function account(seed: AccountSeed): BooksAccounts {
    return {
        number: '',
        description: '',
        inactive: false,
        parent: '',
        currency: 'USD',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...seed,
    }
}

// Listed in the chart's tree order: a parent first, its children after it.
export const ACCOUNTS = [
    account({
        id: 'acct_bank_0001',
        number: '1000',
        name: 'Cash and bank',
        type: 'bank',
        detail_type: 'cash_on_hand',
    }),
    account({
        id: 'acct_bank_0002',
        number: '1010',
        name: 'Operating checking',
        type: 'bank',
        detail_type: 'checking',
        parent: 'acct_bank_0001',
    }),
    account({
        id: 'acct_bank_0003',
        number: '1020',
        name: 'Reserve savings',
        type: 'bank',
        detail_type: 'savings',
        parent: 'acct_bank_0001',
    }),
    account({
        id: 'acct_bank_0004',
        number: '1030',
        name: 'Payroll clearing (overdrawn between pay runs)',
        type: 'bank',
        detail_type: 'checking',
        parent: 'acct_bank_0001',
    }),
    account({
        id: 'acct_bank_0005',
        number: '1040',
        name: 'Old money market (closed 2024)',
        type: 'bank',
        detail_type: 'money_market',
        parent: 'acct_bank_0001',
        inactive: true,
    }),
    account({
        id: 'acct_ar_00001',
        number: '1100',
        name: 'Accounts receivable',
        type: 'accounts_receivable',
        detail_type: 'accounts_receivable',
    }),
    account({
        id: 'acct_oca_0001',
        number: '1200',
        name: 'Undeposited funds',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
    }),
    account({
        id: 'acct_oca_0002',
        name: 'Prepaid insurance, professional liability and cyber coverage (annual policy)',
        type: 'other_current_asset',
        detail_type: 'prepaid_expenses',
    }),
    account({
        id: 'acct_fa_00001',
        number: '1500',
        name: 'Fixed assets',
        type: 'fixed_asset',
        detail_type: 'other_fixed_asset',
    }),
    account({
        id: 'acct_fa_00002',
        number: '1510',
        name: 'Computers and equipment',
        type: 'fixed_asset',
        detail_type: 'machinery_equipment',
        parent: 'acct_fa_00001',
    }),
    account({
        id: 'acct_fa_00003',
        number: '1511',
        name: 'Accumulated depreciation',
        type: 'fixed_asset',
        detail_type: 'accumulated_depreciation',
        parent: 'acct_fa_00001',
    }),
    account({
        id: 'acct_ap_00001',
        number: '2000',
        name: 'Accounts payable',
        type: 'accounts_payable',
        detail_type: 'accounts_payable',
    }),
    account({
        id: 'acct_cc_00001',
        number: '2100',
        name: 'Company card',
        type: 'credit_card',
        detail_type: 'credit_card',
    }),
    account({
        id: 'acct_ocl_0001',
        number: '2200',
        name: 'Payroll taxes and benefit contributions withheld, not yet remitted',
        type: 'other_current_liability',
        detail_type: 'payroll_liabilities',
    }),
    account({
        id: 'acct_ltl_0001',
        number: '2500',
        name: 'Equipment loan',
        type: 'long_term_liability',
        detail_type: 'notes_payable',
    }),
    account({
        id: 'acct_ltl_0002',
        number: '2510',
        name: 'Loan from owner',
        type: 'long_term_liability',
        detail_type: 'owner_loans',
        parent: 'acct_ltl_0001',
    }),
    account({
        id: 'acct_eq_00001',
        number: '3000',
        name: "Owner's equity",
        type: 'equity',
        detail_type: 'owners_equity',
    }),
    account({
        id: 'acct_eq_00002',
        number: '3100',
        name: 'Owner draws',
        type: 'equity',
        detail_type: 'owner_draws',
    }),
] satisfies BooksAccounts[]

export const OPENING_BALANCE_EQUITY_NAME = 'Opening Balance Equity'

export const OPENING_DATE = '2025-12-31'

// The draft entry's lines, keyed by account id. A missing key is a blank amount.
export const DRAFT_AMOUNTS: Record<string, number> = {
    acct_bank_0002: 4825000,
    acct_bank_0003: 1500000,
    acct_bank_0004: -124050,
    acct_bank_0005: 31000,
    acct_ar_00001: 1240000,
    acct_oca_0002: 216000,
    acct_fa_00002: 1450000,
    acct_fa_00003: -422500,
    acct_cc_00001: 318045,
    acct_ap_00001: 592000,
    acct_ocl_0001: 284530,
    acct_ltl_0001: 650000,
    acct_eq_00001: 1000000,
}

export type OpeningEntrySeed = Pick<
    BooksJournalEntries,
    'id' | 'date' | 'memo' | 'status' | 'number' | 'posted_at' | 'replaces' | 'origin'
> & { postedByName: string }

export const POSTED_ENTRY = {
    id: 'entry_open_001',
    date: OPENING_DATE,
    memo: 'Opening balances as of Dec 31, 2025',
    status: 'posted',
    number: 'JE-1046',
    posted_at: '2025-10-24 15:20:00.000Z',
    replaces: '',
    origin: 'opening_balance',
    postedByName: 'Ann Lee',
} satisfies OpeningEntrySeed
