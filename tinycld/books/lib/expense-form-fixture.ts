// Synthetic expenses for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. An account
// line's amount is typed (may be negative, never 0); a product line's amount is
// Qty x Rate rounded half away from zero to cents, as the server writes it. An expense has
// no tax, so `subtotal` and `total` are both the sum of every line of both tables.
//
// The record types are the generated `BooksExpenses` / `BooksExpenseLines`
// (2100000017_create_books_expenses.js), and the rows are checked with `satisfies`, so a
// row that drifts from the schema fails tsc.
//
// An expense names its Paid from account, and a line its account, by seed account number
// (`paid_from_number`, `account_number`), as the bill fixture does: the relation id is
// known only after the seed creates the accounts. The seed maps each number to the created
// account's id.

import type { BooksExpenseLines, BooksExpenses } from '../types'
import { INVOICE_USER_IDS } from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { PURCHASE_ACCOUNT_TYPES } from './purchase-line-columns'
import { SEED_ACCOUNTS, type SeedAccount } from './seed-accounts'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export { EXPENSE_REF_HINT } from './document-texts'

export const EXPENSE_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const EXPENSE_TODAY = '2026-11-14'

const STAMP = '2026-11-14 09:00:00.000Z'

export type ExpenseStatus = BooksExpenses['status']
export type ExpenseLineKind = BooksExpenseLines['kind']

// vendor '' is "No vendor"; date is the payment date; reference_no (at most 40
// characters) is a check number or a card reference.
export type ExpenseRecord = BooksExpenses
export type ExpenseLineRecord = BooksExpenseLines

// `paid_from_number` and `account_number` are fixture columns the seed maps to
// `paid_from` and `account`.
export type ExpenseFixtureRecord = Omit<ExpenseRecord, 'paid_from'> & { paid_from_number: string }
export type ExpenseLineFixtureRecord = Omit<ExpenseLineRecord, 'account'> & {
    account_number: string
}

// The users the read view names in "Posted by" and "Voided by" (the invoice fixture's).
export const EXPENSE_USER_IDS = INVOICE_USER_IDS

export const EXPENSE_IDS = {
    // Draft, no vendor, Cash from 1000 Business Checking, one account line on 6100 Rent.
    draft: 'expdraftcash001',
    // Posted 1002, Pacific Power, Check 1042 from 1000 Business Checking: two account
    // lines, one negative (a credit the vendor applied), one with a long description.
    pacificPower: 'exp1002pacpow01',
    // Posted 1003, Office Supply World, Credit card from 2100 Company Card: an account
    // line and a product line.
    officeSupply: 'exp1003offsup01',
    // Void 1001, Summit IT Services, Check 1038 from 1000 Business Checking: September
    // managed services paid twice.
    voided: 'exp1001summit01',
} as const

const IDS = EXPENSE_IDS

type ExpenseSeed = Pick<
    ExpenseFixtureRecord,
    'id' | 'vendor' | 'paid_from_number' | 'payment_method' | 'status' | 'date'
> &
    Partial<ExpenseFixtureRecord>

function expense(seed: ExpenseSeed): ExpenseFixtureRecord {
    return {
        reference_no: '',
        number: '',
        sequence: 0,
        memo: '',
        subtotal: 0,
        total: 0,
        currency: EXPENSE_CURRENCY,
        revision: 1,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: '',
        posted_at: '',
        voided_by: '',
        voided_at: '',
        form: '',
        fields: null,
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const EXPENSES = [
    expense({
        id: IDS.draft,
        vendor: '',
        paid_from_number: '1000',
        payment_method: 'cash',
        status: 'draft',
        date: EXPENSE_TODAY,
        memo: 'Paid at the storage office front desk',
        subtotal: 18_500,
        total: 18_500,
    }),
    expense({
        id: IDS.pacificPower,
        vendor: VENDOR_IDS.pacificPower,
        paid_from_number: '1000',
        payment_method: 'check',
        reference_no: '1042',
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-10-05',
        memo: 'Autopay failed; paid by check at the counter.',
        subtotal: 13_837,
        total: 13_837,
        entry: 'jeexpe100200001',
        posted_by: EXPENSE_USER_IDS.ana,
        posted_at: '2026-10-05 17:42:00.000Z',
    }),
    expense({
        id: IDS.officeSupply,
        vendor: VENDOR_IDS.officeSupply,
        paid_from_number: '2100',
        payment_method: 'credit_card',
        reference_no: 'Visa 4417',
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-22',
        memo: 'Design desk supplies and cables for the new conference room',
        subtotal: 11_068,
        total: 11_068,
        entry: 'jeexpe100300001',
        posted_by: EXPENSE_USER_IDS.omar,
        posted_at: '2026-10-22 15:10:00.000Z',
    }),
    expense({
        id: IDS.voided,
        vendor: VENDOR_IDS.summit,
        paid_from_number: '1000',
        payment_method: 'check',
        reference_no: '1038',
        status: 'void',
        number: '1001',
        sequence: 1001,
        date: '2026-10-01',
        memo: 'September managed services (already paid by bill 1003)',
        subtotal: 128_000,
        total: 128_000,
        entry: 'jeexpe100100001',
        posted_by: EXPENSE_USER_IDS.ana,
        posted_at: '2026-10-01 16:00:00.000Z',
        voided_by: EXPENSE_USER_IDS.omar,
        voided_at: '2026-10-03 09:25:00.000Z',
    }),
] satisfies ExpenseFixtureRecord[]

// The expenses the seed writes (spec §4 seed), in this order: posting numbers them 1001,
// 1002, 1003 in the seeded book; the void one is posted, then voided. The draft is saved
// last and never posted.
export const EXPENSE_SEED_IDS = [IDS.voided, IDS.pacificPower, IDS.officeSupply, IDS.draft] as const

type LineSeed = Pick<ExpenseLineFixtureRecord, 'kind'> & Partial<ExpenseLineFixtureRecord>

function lines(expenseId: string, tag: string, seeds: LineSeed[]): ExpenseLineFixtureRecord[] {
    return seeds.map((seed, position) => ({
        id: `expl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        expense: expenseId,
        account_number: '',
        product: '',
        description: '',
        quantity: 0,
        rate: 0,
        amount: 0,
        created: STAMP,
        updated: STAMP,
        ...seed,
        position,
    }))
}

// At most 4000 characters (spec §3.4), long enough to wrap in the Description cell.
export const LONG_EXPENSE_DESCRIPTION =
    'Electricity, suite 210, September 4 to October 3, meter 114-387; includes the after-hours HVAC run for the server closet during the heat advisory week.'

// Positions run per expense across both tables; each table keeps its own order by
// position.
export const EXPENSE_LINES = [
    ...lines(IDS.draft, 'drft', [
        {
            kind: 'account',
            account_number: '6100',
            description: 'Storage unit 14B, November',
            amount: 18_500,
        },
    ]),
    // 14 837 - 1 000 = 13 837.
    ...lines(IDS.pacificPower, '1002', [
        {
            kind: 'account',
            account_number: '6100',
            description: LONG_EXPENSE_DESCRIPTION,
            amount: 14_837,
        },
        {
            kind: 'account',
            account_number: '6100',
            description: 'Credit for the August meter misread',
            amount: -1_000,
        },
    ]),
    // Account line 6 418; product line 15 x 310 = 4 650; total 11 068.
    ...lines(IDS.officeSupply, '1003', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Drawing tablet nibs and a replacement stylus',
            amount: 6_418,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 15,
            rate: 310,
            amount: 4_650,
        },
    ]),
    ...lines(IDS.voided, '1001', [
        {
            kind: 'account',
            account_number: '6200',
            description:
                'Managed IT services, September: monitoring, patching and help desk for 14 seats',
            amount: 128_000,
        },
    ]),
] satisfies ExpenseLineFixtureRecord[]

// The Paid from choices of the seeded book (spec §3.3): its active bank and credit card
// accounts in chart order. A credit card account sets Payment method to Credit card, a
// bank account of detail type Cash on hand to Cash, any other bank account to Check.
export const PAID_FROM_TYPES: ReadonlySet<string> = new Set(['bank', 'credit_card'])
export const PAID_FROM_ACCOUNTS: SeedAccount[] = SEED_ACCOUNTS.filter(
    account => PAID_FROM_TYPES.has(account.type) && !account.inactive
)

export function defaultMethodFor(account: Pick<SeedAccount, 'type' | 'detail_type'>) {
    if (account.type === 'credit_card') return 'credit_card' as const
    if (account.detail_type === 'cash_on_hand') return 'cash' as const
    return 'check' as const
}

// What the reference shows under Paid from: each account's own posted balance (the
// Chart of Accounts figure) in cents. 1010 is overdrawn, so its line shows in the danger
// tone. The seeded book's real balances come from its posted entries, not from here.
export const PAID_FROM_BALANCES: Record<string, number> = {
    '1000': 711_856,
    '1010': -4_210,
    '2100': 243_107,
}

// What the reference shows for the client's and the server's refusals (spec §3.3-§3.6).
export const EXPENSE_REFUSALS = {
    noPaidFromAccounts: 'Add a bank or credit card account to the chart of accounts',
    notPaymentAccount: 'Choose a bank or credit card account.',
    inactivePaidFrom: '1000 Business Checking is inactive. Choose an active account.',
    duplicateCheck: 'Check no. 1042 from 1000 Business Checking is already on Expense 1002.',
    duplicateCheckOnDraft:
        'Check no. 1042 from 1000 Business Checking is already on a draft expense.',
    inactiveAccount: 'Account line 1: Old Petty Cash is inactive. Choose an active account.',
    notPurchased:
        'Product line 1: Printer paper, case is not purchased. Turn on “I purchase this” for it first.',
    inactiveVendor: 'Pacific Power is inactive. Choose an active vendor.',
    closeDate:
        'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-12.',
    belowZero: 'An expense total cannot be below zero.',
    zeroTotal: 'An expense total must be more than zero to post.',
    tooLarge: 'The expense total is more than Books can store.',
    tooManyLines: 'An expense holds at most 250 lines.',
    conflict:
        'This expense changed after you opened it. Load it again, then review it before you save or post.',
    notFound: 'This expense does not exist',
    cannotEdit: 'This expense cannot be edited',
    noAccess: 'You need bookkeeper access to create expenses',
} as const

export const EXPENSE_DIALOGS = {
    deleteDraft: {
        title: 'Delete this draft expense?',
        body: "This can't be undone.",
    },
    void: 'A reversing entry is posted in the original period. The number is kept.',
} as const

export const NO_EXPENSES: ExpenseFixtureRecord[] = []

// A fixture that names a missing vendor, product or account, an account the expense's
// Account picker does not list, or a Paid from account that is not a bank or credit card
// account, is a fixture bug, not data.
// A product line's product is active and purchased ("I purchase this"), as the Product
// picker lists them.
const KNOWN_PRODUCTS = new Set(
    PRODUCTS.filter(row => row.purchases && !row.inactive).map(row => row.id)
)
const KNOWN_VENDORS = new Set(VENDORS.map(row => row.id))
const PAID_FROM_NUMBERS = new Set(PAID_FROM_ACCOUNTS.map(account => account.number))
const LINE_ACCOUNT_NUMBERS = new Set(
    SEED_ACCOUNTS.filter(account => PURCHASE_ACCOUNT_TYPES.has(account.type)).map(
        account => account.number
    )
)
for (const row of EXPENSES) {
    if (row.vendor !== '' && !KNOWN_VENDORS.has(row.vendor)) {
        throw new Error(`expense fixture: ${row.id} names an unknown vendor`)
    }
    if (!PAID_FROM_NUMBERS.has(row.paid_from_number)) {
        throw new Error(`expense fixture: ${row.id} is paid from ${row.paid_from_number}`)
    }
    if (row.reference_no.length > 40) {
        throw new Error(`expense fixture: ${row.id} has a Ref no. over 40 characters`)
    }
    const sum = EXPENSE_LINES.filter(line => line.expense === row.id).reduce(
        (total, line) => total + line.amount,
        0
    )
    if (sum !== row.total || row.subtotal !== row.total) {
        throw new Error(`expense fixture: ${row.id} total does not match its lines`)
    }
}
for (const line of EXPENSE_LINES) {
    if (line.kind === 'item' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`expense fixture: line ${line.id} names no purchased active product`)
    }
    if (line.kind === 'item' && line.amount !== Math.round(line.quantity * line.rate)) {
        throw new Error(`expense fixture: line ${line.id} amount is not Qty x Rate`)
    }
    if (line.kind === 'account' && !LINE_ACCOUNT_NUMBERS.has(line.account_number)) {
        throw new Error(
            `expense fixture: line ${line.id} names ${line.account_number}, not an expense account`
        )
    }
}
