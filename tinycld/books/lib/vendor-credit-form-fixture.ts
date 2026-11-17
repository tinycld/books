// Synthetic vendor credits for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents), entered positive (spec §3.4): a line of 5 000
// is $50.00 of credit. An account line's amount is typed (may be negative, never 0); a
// product line's amount is Qty x Rate rounded half away from zero to cents, as the server
// writes it. A vendor credit has no tax, so `subtotal` and `total` are both the sum of
// every line of both tables. `balance` is the credit not yet applied: the total of a
// posted credit less its applications, 0 on a draft and on a void one.
//
// The collections do not exist yet. VendorCreditRecord, VendorCreditLineRecord and
// VendorCreditApplicationRecord mirror spec §4 (migration
// 2100000023_create_books_vendor_credits.js). The checkpoint that adds that migration
// (checkpoint 1) must replace them with the generated `BooksVendorCredits`,
// `BooksVendorCreditLines` and `BooksVendorCreditApplications` from '../types', and the
// `satisfies` checks below then hold the rows to the real schema.
//
// A line names its account by seed account number (`account_number`), as the bill fixture
// does: the relation id is known only after the seed creates the accounts.

import type { BooksBillLines, BooksBills } from '../types'
import { INVOICE_USER_IDS, INVOICE_USER_NAMES } from './invoice-form-fixture'
import { PAY_BILLS_BILLS } from './pay-bills-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { PURCHASE_ACCOUNT_TYPES } from './purchase-line-columns'
import { SEED_ACCOUNTS } from './seed-accounts'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export const VENDOR_CREDIT_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const VENDOR_CREDIT_TODAY = '2026-11-17'

const STAMP = '2026-11-17 09:00:00.000Z'

// Spec §4 `books_vendor_credits`: the bill's columns without Terms, Due date and Mailing
// address (Q7). Replaced by `BooksVendorCredits` in checkpoint 1.
export type VendorCreditRecord = Omit<BooksBills, 'terms' | 'due_date' | 'mailing_address'>
export type VendorCreditStatus = VendorCreditRecord['status']

// Spec §4 `books_vendor_credit_lines`: as `books_bill_lines` with `vendor_credit` as the
// parent. Replaced by `BooksVendorCreditLines` in checkpoint 1.
export type VendorCreditLineRecord = Omit<BooksBillLines, 'bill'> & { vendor_credit: string }
// `account_number` is a fixture column the seed maps to `account`.
export type VendorCreditLineFixtureRecord = Omit<VendorCreditLineRecord, 'account'> & {
    account_number: string
}

// Spec §4 `books_vendor_credit_applications`. Replaced by `BooksVendorCreditApplications`
// in checkpoint 1. `date` is the apply date, an ISO day.
export type VendorCreditApplicationRecord = {
    id: string
    vendor_credit: string
    bill: string
    amount: number
    date: string
    applied_by: string
    created: string
}

// The users the read view names in "Posted by" and "Voided by" (the invoice fixture's).
export const VENDOR_CREDIT_USER_IDS = INVOICE_USER_IDS
export const VENDOR_CREDIT_USER_NAMES = INVOICE_USER_NAMES

export const VENDOR_CREDIT_IDS = {
    // Draft, Office Supply World: one product line with a long description.
    draft: 'vcrddraftoffs01',
    // Posted 1001, Pacific Power: one account line, a vendor's credit no., nothing applied.
    // Pacific Power has three open bills (pay-bills fixture), so the notice and the apply
    // dialog show.
    unapplied: 'vcrd1001pacpw01',
    // Posted 1002, Ironclad Equipment Rentals: both tables (a negative account line too),
    // $30.00 applied in full to the seeded bill below, the rest unapplied (Partly applied).
    partly: 'vcrd1002ironc01',
    // Void 1003, Summit IT Services: entered for the wrong vendor.
    voided: 'vcrd1003summit1',
    // Reference only (not seeded): posted 1004, Office Supply World, applied in full
    // (Applied, balance 0).
    applied: 'vcrd1004offsup1',
} as const

const IDS = VENDOR_CREDIT_IDS

type CreditSeed = Pick<VendorCreditRecord, 'id' | 'vendor' | 'status' | 'date'> &
    Partial<VendorCreditRecord>

function credit(seed: CreditSeed): VendorCreditRecord {
    if (!VENDORS.some(row => row.id === seed.vendor)) {
        throw new Error(`vendor credit fixture: ${seed.id} names an unknown vendor`)
    }
    return {
        number: '',
        sequence: 0,
        ref_no: '',
        memo: '',
        subtotal: 0,
        total: 0,
        balance: 0,
        revision: 1,
        currency: VENDOR_CREDIT_CURRENCY,
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

export const VENDOR_CREDITS = [
    credit({
        id: IDS.draft,
        vendor: VENDOR_IDS.officeSupply,
        status: 'draft',
        date: VENDOR_CREDIT_TODAY,
        ref_no: 'OSW-CR-20261117-RETURN-000482',
        memo: 'Waiting for Office Supply World to confirm the cable count',
        subtotal: 3_720,
        total: 3_720,
    }),
    credit({
        id: IDS.unapplied,
        vendor: VENDOR_IDS.pacificPower,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-11-12',
        ref_no: 'CM-8841',
        memo: 'Meter 4471 was read twice in October',
        subtotal: 65_000,
        total: 65_000,
        balance: 65_000,
        entry: 'jevcredit100101',
        posted_by: VENDOR_CREDIT_USER_IDS.ana,
        posted_at: '2026-11-12 17:05:00.000Z',
    }),
    credit({
        id: IDS.partly,
        vendor: VENDOR_IDS.ironclad,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-11-13',
        ref_no: 'IER-CN-0093',
        memo: 'Return authorised by Dana, RMA 5521',
        subtotal: 27_020,
        total: 27_020,
        balance: 24_020,
        entry: 'jevcredit100201',
        posted_by: VENDOR_CREDIT_USER_IDS.omar,
        posted_at: '2026-11-13 15:30:00.000Z',
    }),
    credit({
        id: IDS.voided,
        vendor: VENDOR_IDS.summit,
        status: 'void',
        number: '1003',
        sequence: 1003,
        date: '2026-11-14',
        ref_no: 'SUM-CR-118',
        memo: 'Entered for the wrong vendor',
        subtotal: 12_000,
        total: 12_000,
        entry: 'jevcredit100301',
        posted_by: VENDOR_CREDIT_USER_IDS.ana,
        posted_at: '2026-11-14 16:20:00.000Z',
        voided_by: VENDOR_CREDIT_USER_IDS.omar,
        voided_at: '2026-11-15 09:40:00.000Z',
    }),
    credit({
        id: IDS.applied,
        vendor: VENDOR_IDS.officeSupply,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-15',
        ref_no: 'OSW-CR-2260',
        memo: 'Overcharge on the October order',
        subtotal: 4_240,
        total: 4_240,
        balance: 0,
        entry: 'jevcredit100401',
        posted_by: VENDOR_CREDIT_USER_IDS.ana,
        posted_at: '2026-11-15 18:10:00.000Z',
    }),
] satisfies VendorCreditRecord[]

// What the seed writes (spec §4 seed), in this order, so posting numbers them 1001, 1002,
// 1003 in the seeded book; the void one is posted, then voided; the draft is saved last
// and never posted. `applied` is for the reference only.
export const VENDOR_CREDIT_SEED_IDS = [IDS.unapplied, IDS.partly, IDS.voided, IDS.draft] as const

type LineSeed = Pick<VendorCreditLineFixtureRecord, 'kind'> & Partial<VendorCreditLineFixtureRecord>

function lines(creditId: string, tag: string, seeds: LineSeed[]): VendorCreditLineFixtureRecord[] {
    return seeds.map((seed, position) => ({
        id: `vcrl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        vendor_credit: creditId,
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

// At most 4000 characters (spec §3.4), long enough to wrap to the three-line cap.
export const LONG_CREDIT_DESCRIPTION =
    'Twelve patch cables came with crushed connectors. Office Supply World agreed by phone on November 16 to credit the full case and asked for the cables back with the next delivery; the driver signs the return slip.'

// Positions run per credit across both tables; each table keeps its own order by position.
export const VENDOR_CREDIT_LINES = [
    ...lines(IDS.draft, 'drft', [
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: LONG_CREDIT_DESCRIPTION,
            quantity: 12,
            rate: 310,
            amount: 3_720,
        },
    ]),
    ...lines(IDS.unapplied, '1001', [
        {
            kind: 'account',
            account_number: '6100',
            description: 'Electricity, meter 4471: the October reading was billed twice',
            amount: 65_000,
        },
    ]),
    // Account lines 4 240 - 1 500 = 2 740; product line 2 x 12 140 = 24 280; total 27 020.
    ...lines(IDS.partly, '1002', [
        {
            kind: 'account',
            account_number: '6200',
            description: 'Overcharge on the October rental plan',
            amount: 4_240,
        },
        {
            kind: 'account',
            account_number: '6200',
            description: 'Restocking fee the vendor kept',
            amount: -1_500,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Returned, 2 units, damaged in transit',
            quantity: 2,
            rate: 12_140,
            amount: 24_280,
        },
    ]),
    ...lines(IDS.voided, '1003', [
        {
            kind: 'account',
            account_number: '6200',
            description: 'Help desk seats billed after two people left',
            amount: 12_000,
        },
    ]),
    ...lines(IDS.applied, '1004', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Overcharge on the October order',
            amount: 4_240,
        },
    ]),
] satisfies VendorCreditLineFixtureRecord[]

// The bill the seed posts for the applied credit (spec §4 seed): a NEW bill of a vendor
// with no other open bill, covered in full by credit 1002, so no seeded bill's open
// balance and no Pay Bills row count changes. The plan checks the vendor and the account
// against every spec that reads them before it wires this (lessons 1, 23). `number` is
// what the reference shows; posting assigns the real one.
export const VENDOR_CREDIT_SEED_BILL = {
    id: 'billvcr1013irc1',
    vendor: VENDOR_IDS.ironclad,
    number: '1013',
    date: '2026-11-10',
    due_date: '2026-12-10',
    ref_no: 'IER-88412',
    memo: 'Scissor lift, one day',
    account_number: '6200',
    description: 'Scissor lift rental, November 9',
    total: 3_000,
} as const

// Reference only: the bill credit 1004 went to (Office Supply World's 1005 of the
// pay-bills fixture, shown as that fixture has it).
const APPLIED_BILL = PAY_BILLS_BILLS.find(row => row.number === '1005')
if (!APPLIED_BILL) throw new Error('vendor credit fixture: pay-bills bill 1005 is missing')

export const VENDOR_CREDIT_APPLICATIONS = [
    {
        id: 'vcra1002bill001',
        vendor_credit: IDS.partly,
        bill: VENDOR_CREDIT_SEED_BILL.id,
        amount: 3_000,
        date: '2026-11-16',
        applied_by: VENDOR_CREDIT_USER_IDS.omar,
        created: '2026-11-16 10:15:00.000Z',
    },
    {
        id: 'vcra1004bill001',
        vendor_credit: IDS.applied,
        bill: APPLIED_BILL.id,
        amount: 4_240,
        date: '2026-11-16',
        applied_by: VENDOR_CREDIT_USER_IDS.ana,
        created: '2026-11-16 11:02:00.000Z',
    },
] satisfies VendorCreditApplicationRecord[]

// The seed applies only credit 1002.
export const VENDOR_CREDIT_SEED_APPLICATION_IDS = ['vcra1002bill001'] as const

// The number a bill shows in "Bill 1013 · Nov 16, 2026 · $30.00".
export const VENDOR_CREDIT_BILL_NUMBERS: Record<string, string> = {
    [VENDOR_CREDIT_SEED_BILL.id]: VENDOR_CREDIT_SEED_BILL.number,
    [APPLIED_BILL.id]: APPLIED_BILL.number,
}

export function applicationsOfCredit(creditId: string): VendorCreditApplicationRecord[] {
    return VENDOR_CREDIT_APPLICATIONS.filter(row => row.vendor_credit === creditId).sort((a, b) =>
        a.date.localeCompare(b.date)
    )
}

export function applicationsOfBill(billId: string): VendorCreditApplicationRecord[] {
    return VENDOR_CREDIT_APPLICATIONS.filter(row => row.bill === billId).sort((a, b) =>
        a.date.localeCompare(b.date)
    )
}

export function linesOfCredit(creditId: string): VendorCreditLineFixtureRecord[] {
    return VENDOR_CREDIT_LINES.filter(line => line.vendor_credit === creditId)
}

// The apply dialog's rows (spec §3.9): the vendor's posted bills with a balance, by due
// date then bill number. Pacific Power has three in the pay-bills fixture, one overdue.
export function openBillsOfVendor(vendorId: string) {
    return PAY_BILLS_BILLS.filter(
        row => row.vendor === vendorId && row.status === 'posted' && row.balance > 0
    ).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number))
}

// The read view's badge (spec §3.7): Posted with nothing applied, Partly applied while
// 0 < balance < total, Applied at balance 0.
export type VendorCreditBadge = 'draft' | 'posted' | 'partly_applied' | 'applied' | 'void'
export function vendorCreditBadge(
    row: Pick<VendorCreditRecord, 'status' | 'balance' | 'total'>
): VendorCreditBadge {
    if (row.status !== 'posted') return row.status
    if (row.balance === 0) return 'applied'
    return row.balance < row.total ? 'partly_applied' : 'posted'
}

// What the reference shows for the client rules and the server's refusals (spec §3.5,
// §3.6, §3.7, §3.9, §3.10).
export const VENDOR_CREDIT_TEXTS = {
    refHint: "The number on the vendor's credit note",
    duplicateRef: 'Pacific Power already has credit no. CM-8841 (Vendor credit 1001).',
    inactiveVendor: 'Pacific Power is inactive. Choose an active vendor.',
    inactiveAccount: 'Account line 1: Old Petty Cash is inactive. Choose an active account.',
    notExpenseAccount:
        'Account line 2: Office Equipment is not an expense account. Choose an expense or cost of goods account.',
    belowZero: 'A vendor credit total cannot be below zero. Use a bill.',
    zeroTotal: 'A vendor credit total must be more than zero to post.',
    tooLarge: 'The vendor credit total is more than Books can store.',
    tooManyLines: 'A vendor credit holds at most 250 lines.',
    closeDate:
        'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-12.',
    conflict:
        'This vendor credit changed after you opened it. Load it again, then review it before you save or post.',
    conflictAction: 'Load the current vendor credit',
    deleteDraft: "Delete this draft vendor credit? This can't be undone.",
    voidNote: 'A reversing entry is posted in the original period. The number is kept.',
    noAccess: 'You need bookkeeper access to create vendor credits',
    notFound: 'This vendor credit does not exist',
    cannotEdit: 'This vendor credit cannot be edited',
    loadError: 'Books could not load this vendor credit.',
    voidApplied: 'This credit is applied to bills. Remove it from those bills first.',
    billVoidRefused: 'Vendor credits are applied to this bill. Remove them first.',
    correctionBelowApplied:
        '$30.00 of this credit is applied to bills. Its total cannot be below that.',
    correctionVendorLocked: 'This credit is applied to bills, so its vendor cannot change.',
    vendorOnCredits: 'Pacific Power is on vendor credits. Make it inactive instead.',
} as const

// The apply dialog's words (spec §3.9).
export const APPLY_CREDIT_TEXTS = {
    applyDateBeforeCredit: "The apply date can't be before the credit date.",
    rowOverBalance: 'More than the open balance of $420.00',
    overUnapplied: 'More than the unapplied credit of $650.00.',
    noneSelected: 'Select at least one bill.',
    rowServerOver: 'Bill 1004: the credit is more than its open balance of $420.00.',
    rowNotOpen: 'Bill 1007 is not open. Clear it to continue.',
    noOpenBills:
        'Ironclad Equipment Rentals has no open bills. The credit stays on the vendor until you post a bill.',
    toast: 'Applied $650.00 to 2 bills',
    // The dialog's failed read: Pay Bills' words for the same open-bills query.
    loadFailed: 'Books could not load the open bills.',
    remove: "Remove this credit from Bill 1013? The bill's balance goes up by $30.00 and the credit is unapplied again.",
} as const

export const NO_VENDOR_CREDITS: VendorCreditRecord[] = []
export const NO_APPLICATIONS: VendorCreditApplicationRecord[] = []

// A fixture that names a missing product or account, an account the Account picker does
// not list, or sums that do not match, is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set(PRODUCTS.map(row => row.id))
const CREDIT_ACCOUNT_NUMBERS = new Set(
    SEED_ACCOUNTS.filter(account => PURCHASE_ACCOUNT_TYPES.has(account.type)).map(
        account => account.number
    )
)
for (const line of VENDOR_CREDIT_LINES) {
    if (!VENDOR_CREDITS.some(row => row.id === line.vendor_credit)) {
        throw new Error(`vendor credit fixture: line ${line.id} names an unknown credit`)
    }
    if (line.kind === 'item' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`vendor credit fixture: line ${line.id} names an unknown product`)
    }
    if (line.kind === 'account' && !CREDIT_ACCOUNT_NUMBERS.has(line.account_number)) {
        throw new Error(
            `vendor credit fixture: line ${line.id} names ${line.account_number}, not a purchase account`
        )
    }
}
for (const row of VENDOR_CREDITS) {
    const sum = linesOfCredit(row.id).reduce((total, line) => total + line.amount, 0)
    if (sum !== row.total || row.subtotal !== row.total) {
        throw new Error(`vendor credit fixture: ${row.id} total does not match its lines`)
    }
    const applied = applicationsOfCredit(row.id).reduce((total, app) => total + app.amount, 0)
    const expected = row.status === 'posted' ? row.total - applied : 0
    if (row.balance !== expected) {
        throw new Error(`vendor credit fixture: ${row.id} balance does not match its applications`)
    }
}
