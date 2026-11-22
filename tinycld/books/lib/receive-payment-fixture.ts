// Synthetic payments for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). `applied` and `credited` are the values the
// server writes at posting (applied = sum of the applications, credited = amount −
// applied); an invoice's `balance` is its total less the posted applications that name it.
//
// The record types are the generated ones (2100000019_create_books_payments.js), so a
// fixture row that drifts from the schema fails tsc.

import type { BooksInvoices, BooksPaymentApplications, BooksPayments } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { INVOICE_IDS } from './invoice-form-fixture'
import type { PaymentMethodKey } from './payment-methods'
import { fixtureToken } from './public-token-fixture'
import {
    DEPOSIT_ACCOUNT_IDS,
    DEPOSIT_ACCOUNTS,
    type DepositAccountRow,
} from './sales-receipt-form-fixture'

export const PAYMENT_CURRENCY = 'USD'
// "Today" for the reference captures: due dates before it are overdue.
export const PAYMENT_TODAY = '2026-11-15'

const STAMP = '2026-11-15 09:00:00.000Z'

export { DEPOSIT_ACCOUNT_IDS, DEPOSIT_ACCOUNTS, type DepositAccountRow }

// A chart with bank accounts but no Undeposited funds account: Deposit to then starts
// with "Undeposited funds (created when you post)" (spec §3.2, Q6).
export const DEPOSIT_ACCOUNTS_NO_UNDEPOSITED: DepositAccountRow[] = DEPOSIT_ACCOUNTS.filter(
    account => account.id !== DEPOSIT_ACCOUNT_IDS.undeposited
)

export type PaymentRecord = BooksPayments
export type PaymentStatus = PaymentRecord['status']
export type PaymentApplicationRecord = BooksPaymentApplications
export type OpenInvoiceRecord = BooksInvoices

// The users the read view names in "Posted by" and "Voided by".
export const PAYMENT_USER_IDS = { ana: 'userpayanaruiz1', omar: 'userpayomarbel1' } as const
export const PAYMENT_USER_NAMES: Record<string, string> = {
    [PAYMENT_USER_IDS.ana]: 'Ana Ruiz',
    [PAYMENT_USER_IDS.omar]: 'Omar Bell',
}

// Customer-form fixture rows with no CUSTOMER_IDS key.
export const PAYMENT_CUSTOMER_IDS = {
    // Four open invoices (one overdue, one partly paid, one long) and two paid ones.
    harborview: CUSTOMER_IDS.harborview,
    // One overdue invoice: a payment above it leaves a credit.
    cedarPine: 'cust_cedar_0001',
    // No invoices: everything received is a credit.
    bluefin: 'cust_bluef_0001',
    // One invoice paid by an overpayment.
    northwind: CUSTOMER_IDS.northwind,
    // One invoice paid by a corrected payment.
    aspen: 'cust_aspen_0001',
} as const

const CUSTOMER = PAYMENT_CUSTOMER_IDS

export const PAYMENT_INVOICE_IDS = {
    // Harborview, paid in full by payment 1001.
    paidA: 'invcrp1003harb1',
    paidB: 'invcrp1005harb1',
    // Harborview, open. Oldest due first: overdue, partly, open, long.
    overdue: 'invcrp1006harb1',
    partly: 'invcrp1009harb1',
    open: 'invcrp1011harb1',
    long: 'invcrplongharb1',
    // Cedar & Pine, open and overdue.
    cedarOverdue: 'invcrp1012cedr1',
    // Northwind, paid by the overpayment 1004.
    northwindPaid: 'invcrp1007nwnd1',
    // Aspen Ridge, paid by the correction of payment 1003.
    aspenPaid: 'invcrp1008aspn1',
} as const

const INV = PAYMENT_INVOICE_IDS

type InvoiceSeed = Pick<
    OpenInvoiceRecord,
    'id' | 'customer' | 'number' | 'date' | 'due_date' | 'total' | 'balance'
> &
    Partial<OpenInvoiceRecord>

function invoice(seed: InvoiceSeed): OpenInvoiceRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`payment fixture: ${seed.id} names an unknown customer`)
    return {
        status: 'posted',
        sequence: Number.parseInt(seed.number, 10) || 0,
        terms: 'net_30',
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        message: '',
        memo: '',
        subtotal: seed.total,
        tax_total: 0,
        written_off: 0,
        revision: 1,
        currency: PAYMENT_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        estimate: '',
        posted_by: PAYMENT_USER_IDS.ana,
        posted_at: `${seed.date} 16:00:00.000Z`,
        voided_by: '',
        voided_at: '',
        form: '',
        fields: null,
        sort_key: '',
        public_token: fixtureToken(seed.id),
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const PAYMENT_INVOICES = [
    invoice({
        id: INV.paidA,
        customer: CUSTOMER.harborview,
        number: '1003',
        date: '2026-08-04',
        due_date: '2026-09-03',
        total: 32_500,
        balance: 0,
    }),
    invoice({
        id: INV.paidB,
        customer: CUSTOMER.harborview,
        number: '1005',
        date: '2026-08-18',
        due_date: '2026-09-17',
        total: 18_750,
        balance: 0,
    }),
    invoice({
        id: INV.overdue,
        customer: CUSTOMER.harborview,
        number: '1006',
        date: '2026-09-02',
        due_date: '2026-10-02',
        total: 48_000,
        balance: 48_000,
    }),
    invoice({
        id: INV.partly,
        customer: CUSTOMER.harborview,
        number: '1009',
        date: '2026-10-20',
        due_date: '2026-11-19',
        total: 125_000,
        balance: 75_000,
    }),
    invoice({
        id: INV.open,
        customer: CUSTOMER.harborview,
        number: '1011',
        date: '2026-10-28',
        due_date: '2026-11-27',
        total: 211_177,
        balance: 211_177,
    }),
    invoice({
        id: INV.long,
        customer: CUSTOMER.harborview,
        number: 'HV-2026-RETAINER-001014',
        date: '2026-11-14',
        due_date: '2026-12-14',
        total: 1_234_567_890,
        balance: 1_234_567_890,
    }),
    invoice({
        id: INV.cedarOverdue,
        customer: CUSTOMER.cedarPine,
        number: '1012',
        date: '2026-10-10',
        due_date: '2026-11-09',
        total: 45_000,
        balance: 45_000,
    }),
    invoice({
        id: INV.northwindPaid,
        customer: CUSTOMER.northwind,
        number: '1007',
        date: '2026-09-25',
        due_date: '2026-10-25',
        total: 134_400,
        balance: 0,
    }),
    invoice({
        id: INV.aspenPaid,
        customer: CUSTOMER.aspen,
        number: '1008',
        date: '2026-10-01',
        due_date: '2026-10-31',
        total: 56_089,
        balance: 0,
    }),
] satisfies OpenInvoiceRecord[]

// A customer's open invoices as the form lists them: posted, balance above zero, oldest
// due date first, then number.
export function openInvoicesOf(customerId: string): OpenInvoiceRecord[] {
    return PAYMENT_INVOICES.filter(
        row => row.customer === customerId && row.status === 'posted' && row.balance > 0
    ).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number))
}

export const PAYMENT_IDS = {
    // Posted 1001: Check to 1200 Undeposited funds, pays two invoices in full.
    paidInFull: 'pmntrp1001harb1',
    // Posted 1002: Bank transfer to 1000 Business Checking, part of invoice 1009.
    partial: 'pmntrp1002harb1',
    // Void 1003, replaced by its correction (same number).
    voided: 'pmntrp1003aspn1',
    correction: 'pmntrp1003fix01',
    // Posted 1004: more than invoice 1007, the rest kept as a credit.
    overpayment: 'pmntrp1004nwnd1',
    // Draft: three invoices, the third in part.
    draft: 'pmntrpdraftharb',
} as const

const IDS = PAYMENT_IDS

type PaymentSeed = Pick<PaymentRecord, 'id' | 'customer' | 'status' | 'date' | 'amount'> &
    Partial<PaymentRecord>

function payment(seed: PaymentSeed): PaymentRecord {
    return {
        number: '',
        sequence: 0,
        payment_method: '',
        reference_no: '',
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        applied: 0,
        credited: 0,
        memo: '',
        currency: PAYMENT_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: '',
        posted_at: '',
        voided_by: '',
        voided_at: '',
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const PAYMENTS = [
    payment({
        id: IDS.paidInFull,
        customer: CUSTOMER.harborview,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-10-02',
        payment_method: 'check',
        reference_no: '10442',
        amount: 51_250,
        applied: 51_250,
        memo: 'August and September invoices, one check',
        entry: 'jepayment100101',
        posted_by: PAYMENT_USER_IDS.ana,
        posted_at: '2026-10-02 17:20:00.000Z',
    }),
    payment({
        id: IDS.partial,
        customer: CUSTOMER.harborview,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-11-03',
        payment_method: 'bank_transfer',
        reference_no: 'ACH 7781-2290',
        deposit_to: DEPOSIT_ACCOUNT_IDS.checking,
        amount: 50_000,
        applied: 50_000,
        entry: 'jepayment100201',
        posted_by: PAYMENT_USER_IDS.ana,
        posted_at: '2026-11-03 15:05:00.000Z',
    }),
    payment({
        id: IDS.voided,
        customer: CUSTOMER.aspen,
        status: 'void',
        number: '1003',
        sequence: 1003,
        date: '2026-10-31',
        payment_method: 'check',
        reference_no: '2210',
        amount: 30_000,
        applied: 30_000,
        entry: 'jepayment100301',
        replaced_by: IDS.correction,
        posted_by: PAYMENT_USER_IDS.ana,
        posted_at: '2026-10-31 14:00:00.000Z',
        voided_by: PAYMENT_USER_IDS.omar,
        voided_at: '2026-11-02 09:12:00.000Z',
    }),
    payment({
        id: IDS.correction,
        customer: CUSTOMER.aspen,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-31',
        payment_method: 'check',
        reference_no: '2210',
        amount: 56_089,
        applied: 56_089,
        memo: 'Check was for the full invoice; first entry keyed $300.00',
        entry: 'jepayment100302',
        replaces: IDS.voided,
        posted_by: PAYMENT_USER_IDS.omar,
        posted_at: '2026-11-02 09:12:00.000Z',
    }),
    payment({
        id: IDS.overpayment,
        customer: CUSTOMER.northwind,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-06',
        payment_method: 'check',
        reference_no: '88123',
        amount: 150_000,
        applied: 134_400,
        credited: 15_600,
        memo: 'Rounded up; apply the rest to the December order',
        entry: 'jepayment100401',
        posted_by: PAYMENT_USER_IDS.ana,
        posted_at: '2026-11-06 18:45:00.000Z',
    }),
    payment({
        id: IDS.draft,
        customer: CUSTOMER.harborview,
        status: 'draft',
        date: PAYMENT_TODAY,
        payment_method: 'check',
        reference_no: '10518',
        amount: 124_356,
        memo: 'Check mailed with the remittance stub for three invoices',
    }),
] satisfies PaymentRecord[]

function applications(
    paymentId: string,
    tag: string,
    seeds: { invoice: string; amount: number }[]
): PaymentApplicationRecord[] {
    return seeds.map((seed, position) => ({
        id: `pmap${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        payment: paymentId,
        invoice: seed.invoice,
        amount: seed.amount,
        position,
        created: STAMP,
        updated: STAMP,
    }))
}

export const PAYMENT_APPLICATIONS = [
    ...applications(IDS.paidInFull, 'full', [
        { invoice: INV.paidA, amount: 32_500 },
        { invoice: INV.paidB, amount: 18_750 },
    ]),
    ...applications(IDS.partial, 'part', [{ invoice: INV.partly, amount: 50_000 }]),
    ...applications(IDS.voided, 'void', [{ invoice: INV.aspenPaid, amount: 30_000 }]),
    ...applications(IDS.correction, 'fixd', [{ invoice: INV.aspenPaid, amount: 56_089 }]),
    ...applications(IDS.overpayment, 'over', [{ invoice: INV.northwindPaid, amount: 134_400 }]),
    ...applications(IDS.draft, 'drft', [
        { invoice: INV.overdue, amount: 48_000 },
        { invoice: INV.partly, amount: 75_000 },
        { invoice: INV.open, amount: 1_356 },
    ]),
] satisfies PaymentApplicationRecord[]

export function applicationsOf(paymentId: string): PaymentApplicationRecord[] {
    return PAYMENT_APPLICATIONS.filter(row => row.payment === paymentId).sort(
        (a, b) => a.position - b.position
    )
}

// The posted payments that name an invoice (the invoice read view's Payments block).
export function postedPaymentsOf(invoiceId: string): { payment: PaymentRecord; amount: number }[] {
    return PAYMENT_APPLICATIONS.filter(row => row.invoice === invoiceId).flatMap(row => {
        const owner = PAYMENTS.find(p => p.id === row.payment && p.status === 'posted')
        return owner ? [{ payment: owner, amount: row.amount }] : []
    })
}

/**
 * The form states the reference shows (spec §3.2–§3.5), as the form would hold them:
 * the header fields, whether Amount received was typed, and each listed row's payment
 * in cents by invoice id (a row missing from `payments` is at zero).
 */
export interface PaymentFormFixture {
    customer: string
    date: string
    method: PaymentMethodKey | ''
    reference: string
    depositTo: string
    // Null: Amount received is empty.
    amount: number | null
    amountTyped: boolean
    payments: Record<string, number>
    memo: string
    // Find invoice no.'s text.
    find: string
}

export const PAYMENT_FORM_STATES = {
    // Nothing chosen yet.
    blank: {
        customer: '',
        date: PAYMENT_TODAY,
        method: '',
        reference: '',
        depositTo: DEPOSIT_ACCOUNT_IDS.undeposited,
        amount: null,
        amountTyped: false,
        payments: {},
        memo: '',
        find: '',
    },
    // $1,243.56 typed and spread oldest due first: 1006 and 1009 in full, 1011 in part.
    spread: {
        customer: CUSTOMER.harborview,
        date: PAYMENT_TODAY,
        method: 'check',
        reference: '10518',
        depositTo: DEPOSIT_ACCOUNT_IDS.undeposited,
        amount: 124_356,
        amountTyped: true,
        payments: { [INV.overdue]: 48_000, [INV.partly]: 75_000, [INV.open]: 1_356 },
        memo: 'Check mailed with the remittance stub for three invoices',
        find: '',
    },
    // $1,000.00 typed, rows edited past it: 1009 over its open balance, the sum over the
    // amount received.
    over: {
        customer: CUSTOMER.harborview,
        date: PAYMENT_TODAY,
        method: 'check',
        reference: '10518',
        depositTo: DEPOSIT_ACCOUNT_IDS.undeposited,
        amount: 100_000,
        amountTyped: true,
        payments: { [INV.overdue]: 48_000, [INV.partly]: 80_000 },
        memo: '',
        find: '',
    },
    // $500.00 against one $450.00 invoice: $50.00 kept as a credit.
    credit: {
        customer: CUSTOMER.cedarPine,
        date: PAYMENT_TODAY,
        method: 'credit_card',
        reference: 'AUTH 448120',
        depositTo: DEPOSIT_ACCOUNT_IDS.checking,
        amount: 50_000,
        amountTyped: true,
        payments: { [INV.cedarOverdue]: 45_000 },
        memo: '',
        find: '',
    },
    // A customer with no open invoices: the whole amount is a credit.
    noOpen: {
        customer: CUSTOMER.bluefin,
        date: PAYMENT_TODAY,
        method: 'cash',
        reference: '',
        depositTo: '',
        amount: 25_000,
        amountTyped: true,
        payments: {},
        memo: 'Deposit toward the spring haul-out',
        find: '',
    },
    // Find invoice no. with no customer: no open invoice with that number.
    findMiss: {
        customer: '',
        date: PAYMENT_TODAY,
        method: '',
        reference: '',
        depositTo: DEPOSIT_ACCOUNT_IDS.undeposited,
        amount: null,
        amountTyped: false,
        payments: {},
        memo: '',
        find: '1099',
    },
} satisfies Record<string, PaymentFormFixture>

// Refusal texts the reference shows (spec §3.4, §3.6, §3.9).
export const PAYMENT_TEXTS = {
    chooseCustomer: 'Choose a customer to see their open invoices.',
    amountRequired: 'Enter the amount received',
    noAccess: 'You need bookkeeper access to receive payments',
    loadError: 'Books could not load this payment.',
    notFound: 'This payment does not exist',
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The invoices it paid are open again.',
    invoiceVoidRefused: 'Payments are applied to this invoice. Void or edit those payments first.',
    createdOnPost: 'Undeposited funds (created when you post)',
} as const

/**
 * The two payments seed.ts posts on seeded invoices (spec §4.5): `full` pays the
 * tax-exempt invoice (`INVOICE_IDS.exempt`) in full to 1200 Undeposited funds, `partial`
 * pays part of the no-tax invoice (`INVOICE_IDS.noTax`) to 1000 Business Checking, and
 * `INVOICE_IDS.posted` stays open. `amount: 'total'` is the
 * invoice's posted total, read from the seeded invoice. The days are in October 2026,
 * after each invoice's date, and no report spec reads a fixed day there.
 */
export const PAYMENT_SEED: readonly {
    key: 'full' | 'partial'
    invoice: string
    amount: number | 'total'
    date: string
    payment_method: PaymentMethodKey
    reference_no: string
    depositNumber: string
}[] = [
    {
        key: 'full',
        invoice: INVOICE_IDS.exempt,
        amount: 'total',
        date: '2026-10-17',
        payment_method: 'check',
        reference_no: '4417',
        depositNumber: '1200',
    },
    {
        key: 'partial',
        invoice: INVOICE_IDS.noTax,
        amount: 50_000,
        date: '2026-10-25',
        payment_method: 'bank_transfer',
        reference_no: 'ACH 5521-0193',
        depositNumber: '1000',
    },
]
