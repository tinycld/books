// Synthetic open bills and bill payments for the helix reference route, the seed (seed.ts)
// and tests (pay-bills spec §4.5).
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). A bill's `balance` is its total less the posted
// bill payment lines that name it; a payment's `total` is the sum of its lines.
//
// The rows are typed with the generated `BooksBills`, `BooksBillPayments` and
// `BooksBillPaymentLines` (migration 2100000020 and the in-place edit of 2100000013).
//
// A payment names its Paid from account by seed account number (`paid_from_number`), as
// the expense fixture does: the relation id is known only after the seed creates the
// accounts.

import type { BooksBillPaymentLines, BooksBillPayments, BooksBills } from '../types'
import { BILL_USER_IDS } from './bill-form-fixture'
import { INVOICE_USER_NAMES } from './invoice-form-fixture'
import type { DueFilter } from './pay-bills-rows'
import type { PaymentMethodKey } from './payment-methods'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export const PAY_BILLS_CURRENCY = 'USD'
// "Today" for the reference captures: due dates before it are overdue.
export const PAY_BILLS_TODAY = '2026-11-15'

const STAMP = '2026-11-15 09:00:00.000Z'

export const PAY_BILLS_USER_IDS = BILL_USER_IDS
export const PAY_BILLS_USER_NAMES = INVOICE_USER_NAMES

export type PayBillsBill = BooksBills

export type BillPaymentRecord = BooksBillPayments

export type BillPaymentLineRecord = BooksBillPaymentLines

// `paid_from_number` is a fixture column the seed maps to `paid_from`.
export type BillPaymentFixtureRecord = Omit<BillPaymentRecord, 'paid_from'> & {
    paid_from_number: string
}

export const PAY_BILLS_VENDOR_IDS = {
    // Four bills: one overdue, two open, one paid by the posted payment 1005 (edit state).
    pacificPower: VENDOR_IDS.pacificPower,
    // One overdue bill partly paid by the corrected payment 1004, two paid by 1001.
    officeSupply: VENDOR_IDS.officeSupply,
    // One bill partly paid by payment 1002.
    summit: VENDOR_IDS.summit,
    // The long vendor name, with the long bill.
    willamette: VENDOR_IDS.willamette,
    // No bill at all: the Vendor filter on it shows "No open bills match these filters."
    okafor: VENDOR_IDS.okafor,
} as const

const VENDOR = PAY_BILLS_VENDOR_IDS

export const PAY_BILLS_BILL_IDS = {
    // Open, in due-date order.
    pacificOverdue: 'billpb1004pacp1',
    officePartly: 'billpb1005offs1',
    pacificOpen: 'billpb1007pacp1',
    summitPartly: 'billpb1006summ1',
    long: 'billpblongwilla',
    pacificLater: 'billpb1011pacp1',
    // Paid in full.
    officePaidA: 'billpb1009offs1',
    officePaidB: 'billpb1010offs1',
    pacificPaid: 'billpb1012pacp1',
} as const

const BILL = PAY_BILLS_BILL_IDS

type BillSeed = Pick<
    PayBillsBill,
    'id' | 'vendor' | 'number' | 'date' | 'due_date' | 'ref_no' | 'total' | 'balance'
> &
    Partial<PayBillsBill>

function bill(seed: BillSeed): PayBillsBill {
    const vendor = VENDORS.find(row => row.id === seed.vendor)
    if (!vendor) throw new Error(`pay-bills fixture: ${seed.id} names an unknown vendor`)
    return {
        status: 'posted',
        sequence: Number.parseInt(seed.number, 10) || 0,
        terms: vendor.terms,
        mailing_address: vendor.address,
        memo: '',
        subtotal: seed.total,
        revision: 1,
        currency: PAY_BILLS_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: PAY_BILLS_USER_IDS.ana,
        posted_at: `${seed.date} 16:00:00.000Z`,
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

export const PAY_BILLS_BILLS = [
    bill({
        id: BILL.pacificOverdue,
        vendor: VENDOR.pacificPower,
        number: '1004',
        date: '2026-10-05',
        due_date: '2026-11-04',
        ref_no: '88412',
        total: 42_000,
        balance: 42_000,
    }),
    bill({
        id: BILL.officePartly,
        vendor: VENDOR.officeSupply,
        number: '1005',
        date: '2026-10-13',
        due_date: '2026-11-12',
        ref_no: 'OSW-2231',
        memo: 'Toner and paper, Q4',
        total: 125_000,
        balance: 53_000,
    }),
    bill({
        id: BILL.pacificOpen,
        vendor: VENDOR.pacificPower,
        number: '1007',
        date: '2026-11-05',
        due_date: '2026-11-20',
        ref_no: '88530',
        total: 50_000,
        balance: 50_000,
    }),
    bill({
        id: BILL.summitPartly,
        vendor: VENDOR.summit,
        number: '1006',
        date: '2026-11-01',
        due_date: '2026-12-01',
        ref_no: '7781',
        total: 98_000,
        balance: 48_000,
    }),
    bill({
        id: BILL.long,
        vendor: VENDOR.willamette,
        number: '1008',
        date: '2026-11-10',
        due_date: '2026-12-10',
        ref_no: 'WVCC-2026-Q4-JANITORIAL-000771',
        total: 1_234_567_890,
        balance: 1_234_567_890,
    }),
    bill({
        id: BILL.pacificLater,
        vendor: VENDOR.pacificPower,
        number: '1011',
        date: '2026-11-14',
        due_date: '2026-12-20',
        ref_no: '88601',
        total: 31_000,
        balance: 31_000,
    }),
    bill({
        id: BILL.officePaidA,
        vendor: VENDOR.officeSupply,
        number: '1009',
        date: '2026-09-28',
        due_date: '2026-10-28',
        ref_no: 'OSW-2108',
        total: 18_750,
        balance: 0,
    }),
    bill({
        id: BILL.officePaidB,
        vendor: VENDOR.officeSupply,
        number: '1010',
        date: '2026-10-02',
        due_date: '2026-11-01',
        ref_no: 'OSW-2140',
        total: 32_500,
        balance: 0,
    }),
    bill({
        id: BILL.pacificPaid,
        vendor: VENDOR.pacificPower,
        number: '1012',
        date: '2026-10-20',
        due_date: '2026-11-19',
        ref_no: '88477',
        total: 92_000,
        balance: 0,
    }),
] satisfies PayBillsBill[]

// The rows Pay Bills lists (spec §3.3): posted, balance above zero, due date ascending,
// then bill number.
export function openBillsOf(bills: readonly PayBillsBill[]): PayBillsBill[] {
    return bills
        .filter(row => row.status === 'posted' && row.balance > 0)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number))
}

export const NO_OPEN_BILLS: PayBillsBill[] = []

export const BILL_PAYMENT_IDS = {
    // Posted 1001: Check 1042 from 1000, pays Office Supply World's 1009 and 1010 in full.
    paidInFull: 'bpay1001offsup1',
    // Posted 1002: Bank transfer from 1000, part of Summit's 1006.
    partial: 'bpay1002summit1',
    // Void 1003: Check 1043 on Pacific Power's 1004, voided (1004 is open again).
    voided: 'bpay1003pacpow1',
    // Void 1004, replaced by its correction (same number): $300.00 keyed for $720.00.
    original: 'bpay1004offsup1',
    correction: 'bpay1004fixoff1',
    // Posted 1005: Check 1050 from 1000, pays Pacific Power's 1012 in full (the edit state).
    edited: 'bpay1005pacpow1',
} as const

const PAY = BILL_PAYMENT_IDS

type PaymentSeed = Pick<
    BillPaymentFixtureRecord,
    'id' | 'vendor' | 'status' | 'number' | 'date' | 'total' | 'payment_method'
> &
    Partial<BillPaymentFixtureRecord>

function payment(seed: PaymentSeed): BillPaymentFixtureRecord {
    return {
        paid_from_number: '1000',
        reference_no: '',
        sequence: Number.parseInt(seed.number, 10) || 0,
        currency: PAY_BILLS_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: PAY_BILLS_USER_IDS.ana,
        posted_at: `${seed.date} 17:20:00.000Z`,
        voided_by: '',
        voided_at: '',
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const BILL_PAYMENTS = [
    payment({
        id: PAY.paidInFull,
        vendor: VENDOR.officeSupply,
        status: 'posted',
        number: '1001',
        date: '2026-10-30',
        payment_method: 'check',
        reference_no: '1042',
        total: 51_250,
        entry: 'jebillpay100101',
    }),
    payment({
        id: PAY.partial,
        vendor: VENDOR.summit,
        status: 'posted',
        number: '1002',
        date: '2026-11-08',
        payment_method: 'bank_transfer',
        reference_no: 'ACH 5520-118',
        total: 50_000,
        entry: 'jebillpay100201',
        posted_by: PAY_BILLS_USER_IDS.omar,
    }),
    payment({
        id: PAY.voided,
        vendor: VENDOR.pacificPower,
        status: 'void',
        number: '1003',
        date: '2026-11-06',
        payment_method: 'check',
        reference_no: '1043',
        total: 42_000,
        entry: 'jebillpay100301',
        voided_by: PAY_BILLS_USER_IDS.omar,
        voided_at: '2026-11-07 10:05:00.000Z',
    }),
    payment({
        id: PAY.original,
        vendor: VENDOR.officeSupply,
        status: 'void',
        number: '1004',
        date: '2026-11-14',
        payment_method: 'check',
        reference_no: '1049',
        total: 30_000,
        entry: 'jebillpay100401',
        replaced_by: PAY.correction,
        voided_by: PAY_BILLS_USER_IDS.omar,
        voided_at: '2026-11-14 18:40:00.000Z',
    }),
    payment({
        id: PAY.correction,
        vendor: VENDOR.officeSupply,
        status: 'posted',
        number: '1004',
        date: '2026-11-14',
        payment_method: 'check',
        reference_no: '1049',
        total: 72_000,
        entry: 'jebillpay100402',
        replaces: PAY.original,
        posted_by: PAY_BILLS_USER_IDS.omar,
        posted_at: '2026-11-14 18:40:00.000Z',
    }),
    payment({
        id: PAY.edited,
        vendor: VENDOR.pacificPower,
        status: 'posted',
        number: '1005',
        date: '2026-11-12',
        payment_method: 'check',
        reference_no: '1050',
        total: 92_000,
        entry: 'jebillpay100501',
    }),
] satisfies BillPaymentFixtureRecord[]

function lines(
    paymentId: string,
    tag: string,
    seeds: { bill: string; amount: number }[]
): BillPaymentLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `bpln${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        payment: paymentId,
        bill: seed.bill,
        amount: seed.amount,
        position,
        created: STAMP,
        updated: STAMP,
    }))
}

export const BILL_PAYMENT_LINES = [
    ...lines(PAY.paidInFull, 'full', [
        { bill: BILL.officePaidA, amount: 18_750 },
        { bill: BILL.officePaidB, amount: 32_500 },
    ]),
    ...lines(PAY.partial, 'part', [{ bill: BILL.summitPartly, amount: 50_000 }]),
    ...lines(PAY.voided, 'void', [{ bill: BILL.pacificOverdue, amount: 42_000 }]),
    ...lines(PAY.original, 'orig', [{ bill: BILL.officePartly, amount: 30_000 }]),
    ...lines(PAY.correction, 'fixd', [{ bill: BILL.officePartly, amount: 72_000 }]),
    ...lines(PAY.edited, 'edit', [{ bill: BILL.pacificPaid, amount: 92_000 }]),
] satisfies BillPaymentLineRecord[]

export function linesOf(paymentId: string): BillPaymentLineRecord[] {
    return BILL_PAYMENT_LINES.filter(row => row.payment === paymentId).sort(
        (a, b) => a.position - b.position
    )
}

// The posted payments that name a bill (the bill read view's Payments block).
export function postedPaymentsOf(
    billId: string
): { payment: BillPaymentFixtureRecord; amount: number }[] {
    return BILL_PAYMENT_LINES.filter(row => row.bill === billId).flatMap(row => {
        const owner = BILL_PAYMENTS.find(p => p.id === row.payment && p.status === 'posted')
        return owner ? [{ payment: owner, amount: row.amount }] : []
    })
}

// The seed (seed.ts seedBills, then seedBillPayments, spec §4.5) posts these three bills
// after the bill form's BILL_SEED_IDS (so they number 1004–1006 on a fresh book), pays
// part of the first, and pays part of the second with a payment it then voids. Each bill
// has one account line; the memo `Seed bill <key>` is how the seed finds it again.
//
// The days are chosen so no report or register spec reads them (pay-bills checkpoint 1,
// step 11): after the 2026-06-30 close date books-settings.spec.ts sets, and away from
// 2026-07-01 (general-ledger, journal-report, balance-sheet), 2026-07-23 and 2026-07-29
// (report-drill-down), the General Ledger days 2026-08-04 to 2026-08-18 (GL_DAY_1,
// GL_DAY_2) and 2026-09-30 (sales tax liability). The accounts (2000 Accounts payable,
// 1000 Business Checking, 6100 Rent, 6200 Software Subscriptions) are already in the
// trial-balance spec's seeded rows.
export const PAY_BILLS_SEED_BILLS: readonly {
    key: string
    memo: string
    vendor: string
    date: string
    due_date: string
    ref_no: string
    accountNumber: string
    amount: number
}[] = [
    {
        key: 'partial',
        memo: 'Seed bill partial',
        vendor: VENDOR_IDS.officeSupply,
        date: '2026-07-09',
        due_date: '2026-08-08',
        ref_no: 'OSW-1977',
        accountNumber: '6200',
        amount: 125_000,
    },
    {
        key: 'voidpay',
        memo: 'Seed bill voidpay',
        vendor: VENDOR_IDS.pacificPower,
        date: '2026-08-25',
        due_date: '2026-09-24',
        ref_no: '88120',
        accountNumber: '6100',
        amount: 30_000,
    },
    {
        key: 'open',
        memo: 'Seed bill open',
        vendor: VENDOR_IDS.pacificPower,
        date: '2026-09-10',
        due_date: '2026-10-10',
        ref_no: '88233',
        accountNumber: '6100',
        amount: 42_000,
    },
]

// The seeded bill payments: `partial` pays part of the first seeded bill by check 1050 from
// 1000 Business Checking; `void` pays part of the second by bank transfer and is then
// voided, so that bill is fully open again. Payment days as the bills' (above).
export const BILL_PAYMENT_SEED: readonly {
    key: 'partial' | 'void'
    billMemo: string
    amount: number
    date: string
    payment_method: PaymentMethodKey
    reference_no: string
    paidFromNumber: string
}[] = [
    {
        key: 'partial',
        billMemo: 'Seed bill partial',
        amount: 40_000,
        date: '2026-09-15',
        payment_method: 'check',
        reference_no: '1050',
        paidFromNumber: '1000',
    },
    {
        key: 'void',
        billMemo: 'Seed bill voidpay',
        amount: 10_000,
        date: '2026-09-22',
        payment_method: 'bank_transfer',
        reference_no: '',
        paidFromNumber: '1000',
    },
]

// What the reference shows under Paid from and in the summary: each account's own posted
// balance in cents, by seed account number (1000 Business Checking, 1010 Business
// Savings, 2100 the credit card). The seeded book's real balances come from its entries.
export const PAY_BILLS_BALANCES: Record<string, number> = {
    '1000': 721_856,
    '1010': -4_210,
    '2100': 243_107,
}

// The Due filter lives with the list's rules; re-exported for the reference route.
export type { DueFilter } from './pay-bills-rows'

/**
 * The Pay Bills states the reference shows (spec §3.2–§3.6), as the form would hold them:
 * the header fields, the filters, each row's payment in cents by bill id (a row missing
 * from `payments` is at zero), and the refusals on screen.
 */
export interface PayBillsFormFixture {
    // Seed account number of Paid from; '' while none is picked.
    paidFrom: string
    date: string
    method: PaymentMethodKey | ''
    // Starting check no. (Check no. on `replaces`).
    checkNo: string
    vendorFilter: string
    dueFilter: DueFilter
    payments: Record<string, number>
    // A row's message under its Payment cell, by bill id.
    rowErrors: Record<string, string>
    checkError: string
    summaryError: string
    // The posted payment a `?replaces` form corrects.
    replaces: string
}

const BLANK: PayBillsFormFixture = {
    paidFrom: '',
    date: PAY_BILLS_TODAY,
    method: '',
    checkNo: '',
    vendorFilter: '',
    dueFilter: 'any',
    payments: {},
    rowErrors: {},
    checkError: '',
    summaryError: '',
    replaces: '',
}

export const PAY_BILLS_TEXTS = {
    noOpenBills: 'No open bills. Bills you post show here until they are paid.',
    filterEmpty: 'No open bills match these filters.',
    selectOne: 'Select at least one bill to pay.',
    checkDigits: 'Use digits only, up to 9.',
    noAccess: 'You need bookkeeper access to pay bills',
    loadFailed: 'Books could not load the open bills.',
    notFound: 'This bill payment does not exist',
    cannotEdit: 'This bill payment cannot be edited',
    discard: 'Discard this payment? The bills stay open.',
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The bills it paid are open again.',
    billVoidRefused: 'Payments are applied to this bill. Void or edit those payments first.',
    overOpen: 'More than the open balance of $530.00',
    notOpen: 'Bill 1004 is not open. Clear it to continue.',
    checkTaken: 'Check no. 1050 from 1000 Business Checking is already on Bill payment 1005.',
} as const

export const PAY_BILLS_FORM_STATES = {
    blank: BLANK,
    // Three bills of two vendors, 1005 in part, Check from 1050.
    populated: {
        ...BLANK,
        paidFrom: '1000',
        method: 'check',
        checkNo: '1050',
        payments: {
            [BILL.pacificOverdue]: 42_000,
            [BILL.officePartly]: 30_000,
            [BILL.pacificOpen]: 50_000,
        },
    },
    // Due: Overdue keeps 1004 and 1005; 1007 keeps its payment while hidden.
    overdue: {
        ...BLANK,
        paidFrom: '1000',
        method: 'check',
        checkNo: '1050',
        dueFilter: 'overdue',
        payments: { [BILL.pacificOverdue]: 42_000, [BILL.pacificOpen]: 50_000 },
    },
    // A vendor with no bill: no row matches.
    filtered: {
        ...BLANK,
        paidFrom: '1000',
        method: 'check',
        vendorFilter: VENDOR.okafor,
    },
    // Refused: 1005 over its open balance, 1004 no longer open (server), the check taken.
    refused: {
        ...BLANK,
        paidFrom: '1000',
        method: 'check',
        checkNo: '1050',
        payments: { [BILL.pacificOverdue]: 42_000, [BILL.officePartly]: 60_000 },
        rowErrors: {
            [BILL.pacificOverdue]: 'Bill 1004 is not open. Clear it to continue.',
            [BILL.officePartly]: 'More than the open balance of $530.00',
        },
        checkError: 'Check no. 1050 from 1000 Business Checking is already on Bill payment 1005.',
    },
    // Paid from the credit card: no check field, New balance = balance + total.
    card: {
        ...BLANK,
        paidFrom: '2100',
        method: 'credit_card',
        payments: { [BILL.summitPartly]: 48_000, [BILL.pacificLater]: 31_000 },
    },
    // Edit payment 1005 (`?replaces`): Pacific Power only, 1012 at its original amount,
    // 1011 in part added.
    edit: {
        ...BLANK,
        paidFrom: '1000',
        date: '2026-11-12',
        method: 'check',
        checkNo: '1050',
        vendorFilter: VENDOR.pacificPower,
        payments: { [BILL.pacificPaid]: 92_000, [BILL.pacificLater]: 18_000 },
        replaces: PAY.edited,
    },
} satisfies Record<string, PayBillsFormFixture>
