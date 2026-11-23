// Synthetic write-offs for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). A write-off takes the whole open balance of its
// invoice (spec §3.2, Q1), so a posted write-off's `amount` is the balance the invoice had
// right before it. An invoice's `balance` is its total less its posted payments and less its
// posted write-offs; its `written_off` is the sum of its posted write-offs (spec §3.4).
//
// `WriteOffRecord` and `WriteOffInvoiceRecord` are the generated `BooksWriteOffs` (migration
// 2100000027) and `BooksInvoices` (2100000010, with `written_off`), so the `satisfies`
// checks hold the rows to the real schema.
//
// A write-off names its account by a fixture id (`WRITE_OFF_ACCOUNT_IDS`); the seed maps it
// to the seeded account by number, since the relation id is known only after the seed
// creates the accounts.

import type { BooksAccounts, BooksInvoices, BooksWriteOffs } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { INVOICE_USER_IDS, INVOICE_USER_NAMES } from './invoice-form-fixture'
import { fixtureToken } from './public-token-fixture'

export const WRITE_OFF_CURRENCY = 'USD'
// "Today" for the reference captures, so the default date and the overdue badges are stable.
export const WRITE_OFF_TODAY = '2026-11-18'
// The settings' close date of the "closed period" refusal.
export const WRITE_OFF_CLOSE_DATE = '2026-09-30'

const STAMP = '2026-11-18 09:00:00.000Z'

export const WRITE_OFF_USER_IDS = INVOICE_USER_IDS
export const WRITE_OFF_USER_NAMES = INVOICE_USER_NAMES

// Spec §4.1.
export type WriteOffRecord = BooksWriteOffs

export type WriteOffStatus = WriteOffRecord['status']

// Spec §4.2.
export type WriteOffInvoiceRecord = BooksInvoices

export const WRITE_OFF_CUSTOMER_IDS = {
    // One invoice, never paid, written off whole (the seed's pair, spec §4.5).
    delta: 'cust_delta_0001',
    // One invoice with sales tax, paid in part; the rest is written off.
    foxHollow: 'cust_fox_000001',
    // One invoice whose write-off was voided: the customer paid after all.
    cedarPine: 'cust_cedar_0001',
    // A long name, a long invoice number, a large amount, two posted write-offs.
    stJude: CUSTOMER_IDS.stJude,
} as const

const CUSTOMER = WRITE_OFF_CUSTOMER_IDS

export function writeOffCustomerName(customerId: string): string {
    return CUSTOMERS.find(row => row.id === customerId)?.display_name ?? ''
}

// Write off to (spec §3.2, Q3): the active accounts of type expense and other expense, in
// chart order. The numbers and names are the seed chart's, with the new 6050 Bad debts.
export type WriteOffAccountRow = Pick<
    BooksAccounts,
    'id' | 'number' | 'name' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

export const WRITE_OFF_ACCOUNT_IDS = {
    advertising: 'acctwo600000001',
    badDebts: 'acctwo605000001',
    bankCharges: 'acctwo610000001',
    merchantFees: 'acctwo611000001',
    insurance: 'acctwo620000001',
    // A long name: the select's trigger and the read band truncate or wrap it.
    longName: 'acctwo640000001',
    // Inactive: never offered, but a void write-off may still name it.
    oldBadDebts: 'acctwo690000001',
    depreciation: 'acctwo695000001',
} as const

const ACCOUNT = WRITE_OFF_ACCOUNT_IDS

function account(
    id: string,
    number: string,
    name: string,
    detailType: string,
    extra: Partial<WriteOffAccountRow> = {}
): WriteOffAccountRow {
    return {
        id,
        number,
        name,
        type: 'expense',
        detail_type: detailType,
        parent: '',
        inactive: false,
        ...extra,
    }
}

export const WRITE_OFF_ACCOUNTS: WriteOffAccountRow[] = [
    account(ACCOUNT.advertising, '6000', 'Advertising and marketing', 'advertising_marketing'),
    account(ACCOUNT.badDebts, '6050', 'Bad debts', 'bad_debts'),
    account(ACCOUNT.bankCharges, '6100', 'Bank charges and fees', 'bank_charges'),
    account(ACCOUNT.merchantFees, '6110', 'Merchant account fees', 'bank_charges', {
        parent: ACCOUNT.bankCharges,
    }),
    account(ACCOUNT.insurance, '6200', 'Insurance', 'insurance'),
    account(
        ACCOUNT.longName,
        '6400',
        'Office and general expenses not assigned to a department or a project',
        'office_general'
    ),
    account(ACCOUNT.oldBadDebts, '6900', 'Uncollectible accounts (old)', 'bad_debts', {
        inactive: true,
    }),
    account(ACCOUNT.depreciation, '6950', 'Depreciation', 'depreciation', {
        type: 'other_expense',
    }),
]

// A chart with no active expense account: "Add an expense account to the chart of accounts".
export const NO_WRITE_OFF_ACCOUNTS: WriteOffAccountRow[] = []

export function writeOffAccountLabel(accountId: string): string {
    const row = WRITE_OFF_ACCOUNTS.find(item => item.id === accountId)
    if (!row) return ''
    return `${row.number} ${row.name}`.trim()
}

export const WRITE_OFF_INVOICE_IDS = {
    // Delta Freight 1012: $215.50, no payment, written off whole by write-off 1001.
    whole: 'invcwo1012delt1',
    // Fox Hollow 1009: $1,080.00 with $80.00 tax, $680.00 paid, $400.00 written off by 1003.
    partly: 'invcwo1009foxh1',
    // Cedar & Pine 1015: $1,320.00, write-off 1002 voided; open again and overdue.
    reopened: 'invcwo1015cedr1',
    // St. Jude: a long number and a large total; write-offs 1004 and 1005 are both posted
    // (a payment was voided after 1004, so the invoice was open again for 1005).
    long: 'invcwolongstjd1',
} as const

const INV = WRITE_OFF_INVOICE_IDS

type InvoiceSeed = Pick<
    WriteOffInvoiceRecord,
    'id' | 'customer' | 'number' | 'date' | 'due_date' | 'total' | 'balance' | 'written_off'
> &
    Partial<WriteOffInvoiceRecord>

function invoice(seed: InvoiceSeed): WriteOffInvoiceRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`write-off fixture: ${seed.id} names an unknown customer`)
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
        revision: 1,
        currency: WRITE_OFF_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        estimate: '',
        posted_by: WRITE_OFF_USER_IDS.ana,
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

// The invoices as they are after the write-offs below.
export const WRITE_OFF_INVOICES = [
    invoice({
        id: INV.whole,
        customer: CUSTOMER.delta,
        number: '1012',
        date: '2026-10-03',
        due_date: '2026-11-02',
        total: 21_550,
        balance: 0,
        written_off: 21_550,
        memo: 'Pallet storage, September',
        entry: 'jeinvoice101201',
    }),
    invoice({
        id: INV.partly,
        customer: CUSTOMER.foxHollow,
        number: '1009',
        date: '2026-09-14',
        due_date: '2026-10-14',
        subtotal: 100_000,
        tax_total: 8_000,
        total: 108_000,
        balance: 0,
        written_off: 40_000,
        message: 'Thank you for hosting the autumn tasting with us.',
        memo: 'Autumn menu tasting, 40 guests',
        entry: 'jeinvoice100901',
    }),
    invoice({
        id: INV.reopened,
        customer: CUSTOMER.cedarPine,
        number: '1015',
        date: '2026-10-08',
        due_date: '2026-11-07',
        total: 132_000,
        balance: 132_000,
        written_off: 0,
        entry: 'jeinvoice101501',
    }),
    invoice({
        id: INV.long,
        customer: CUSTOMER.stJude,
        number: 'INV-2026-000104417',
        date: '2026-08-21',
        due_date: '2026-09-20',
        total: 123_456_789,
        balance: 0,
        written_off: 123_456_789,
        memo: 'West Annex renovation, phase 2 catering and site services',
        entry: 'jeinvoicelong01',
    }),
] satisfies WriteOffInvoiceRecord[]

export function writeOffInvoiceById(invoiceId: string): WriteOffInvoiceRecord | undefined {
    return WRITE_OFF_INVOICES.find(row => row.id === invoiceId)
}

// The tax line of the invoice with sales tax: the rate's name with its snapshot percent.
export const WRITE_OFF_INVOICE_TAX_LABEL: Record<string, string> = {
    [INV.partly]: 'State tax (8%)',
}

// The posted payments applied to an invoice (the read view's Payments row and block).
export interface WriteOffInvoicePayment {
    id: string
    invoice: string
    payment: string
    number: string
    date: string
    amount: number
}

export const WRITE_OFF_INVOICE_PAYMENTS: WriteOffInvoicePayment[] = [
    {
        id: 'papwo1004foxh01',
        invoice: INV.partly,
        payment: 'paymwo1004foxh1',
        number: '1004',
        date: '2026-10-02',
        amount: 68_000,
    },
]

export function paymentsOfInvoice(invoiceId: string): WriteOffInvoicePayment[] {
    return WRITE_OFF_INVOICE_PAYMENTS.filter(row => row.invoice === invoiceId)
}

export const WRITE_OFF_IDS = {
    // Posted 1001: Delta Freight's whole invoice 1012 (the seed's write-off).
    whole: 'wofx1001delta01',
    // Void 1002: Cedar & Pine's invoice 1015, voided the next day.
    voided: 'wofx1002cedar01',
    // Posted 1003: the rest of Fox Hollow's invoice 1009 after its payment.
    partly: 'wofx1003foxhl01',
    // Posted 1004 and 1005: St. Jude's long invoice, in two write-offs.
    longFirst: 'wofx1004stjud01',
    longSecond: 'wofx1005stjud01',
} as const

const IDS = WRITE_OFF_IDS

type WriteOffSeed = Pick<
    WriteOffRecord,
    'id' | 'invoice' | 'status' | 'number' | 'date' | 'amount'
> &
    Partial<WriteOffRecord>

function writeOff(seed: WriteOffSeed): WriteOffRecord {
    const named = writeOffInvoiceById(seed.invoice)
    if (!named) throw new Error(`write-off fixture: ${seed.id} names an unknown invoice`)
    return {
        customer: named.customer,
        sequence: Number.parseInt(seed.number, 10) || 0,
        account: ACCOUNT.badDebts,
        memo: '',
        currency: WRITE_OFF_CURRENCY,
        entry: '',
        close_override: '',
        posted_by: WRITE_OFF_USER_IDS.ana,
        posted_at: `${seed.date} 17:30:00.000Z`,
        voided_by: '',
        voided_at: '',
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const WRITE_OFFS = [
    writeOff({
        id: IDS.whole,
        invoice: INV.whole,
        status: 'posted',
        number: '1001',
        date: '2026-11-10',
        amount: 21_550,
        entry: 'jewriteoff10010',
    }),
    writeOff({
        id: IDS.voided,
        invoice: INV.reopened,
        status: 'void',
        number: '1002',
        date: '2026-11-12',
        amount: 132_000,
        account: ACCOUNT.oldBadDebts,
        memo: 'No answer to three reminders',
        entry: 'jewriteoff10020',
        voided_by: WRITE_OFF_USER_IDS.omar,
        voided_at: '2026-11-13 09:25:00.000Z',
    }),
    writeOff({
        id: IDS.partly,
        invoice: INV.partly,
        status: 'posted',
        number: '1003',
        date: WRITE_OFF_TODAY,
        amount: 40_000,
        memo: 'Customer closed the business in October.',
        entry: 'jewriteoff10030',
    }),
    writeOff({
        id: IDS.longFirst,
        invoice: INV.long,
        status: 'posted',
        number: '1004',
        date: '2026-10-30',
        amount: 100_000_000,
        account: ACCOUNT.longName,
        memo: 'The foundation disputes phase 2. Counsel advises that the amount above the deposit will not be collected.',
        entry: 'jewriteoff10040',
    }),
    writeOff({
        id: IDS.longSecond,
        invoice: INV.long,
        status: 'posted',
        number: '1005',
        date: '2026-11-16',
        amount: 23_456_789,
        account: ACCOUNT.longName,
        memo: 'The deposit check of Aug 28 was returned by the bank on Nov 14 and payment 1002 was voided. The foundation has filed for dissolution; its counsel confirmed in writing (letter of Nov 15, on file under Customers / St. Jude / 2026) that no unsecured creditor will be paid. This write-off covers the balance that the voided payment opened again. The board approved it at the November meeting.',
        entry: 'jewriteoff10050',
        posted_by: WRITE_OFF_USER_IDS.omar,
    }),
] satisfies WriteOffRecord[]

export function writeOffById(writeOffId: string): WriteOffRecord | undefined {
    return WRITE_OFFS.find(row => row.id === writeOffId)
}

// The write-offs that name an invoice, by date (the invoice's Write-offs section, §3.4).
export function writeOffsOfInvoice(invoiceId: string): WriteOffRecord[] {
    return WRITE_OFFS.filter(row => row.invoice === invoiceId).sort(
        (a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number)
    )
}

// The invoice as it was right before a posted write-off: open for the write-off's amount.
// The dialog's target, and the "before" state of the reference.
export function invoiceBeforeWriteOff(writeOffId: string): WriteOffInvoiceRecord {
    const row = writeOffById(writeOffId)
    const named = row ? writeOffInvoiceById(row.invoice) : undefined
    if (!row || !named) throw new Error(`write-off fixture: no write-off ${writeOffId}`)
    return {
        ...named,
        balance: named.balance + row.amount,
        written_off: named.written_off - row.amount,
    }
}

// What the seed writes (spec §4.5): the invoice, then its write-off to 6050 Bad debts,
// through the same writes as the dialog. The plan picks the seeded customer and the days
// after its grep of the report and list specs; these are the fixture's rows for the pair.
export const WRITE_OFF_SEED = { invoice: INV.whole, writeOff: IDS.whole } as const

/** The dialog's form as the reference shows it (spec §3.2). */
export interface WriteOffFormFixture {
    date: string
    account: string
    memo: string
}

export const WRITE_OFF_FORM_STATES = {
    // As the dialog opens: today, the default account, no reason.
    opened: { date: WRITE_OFF_TODAY, account: ACCOUNT.badDebts, memo: '' },
    // A reason typed, and a sub-account with a long neighbour in the list.
    filled: {
        date: WRITE_OFF_TODAY,
        account: ACCOUNT.badDebts,
        memo: 'Customer closed the business in October.',
    },
    // A date before the invoice date and no account: both field errors.
    invalid: { date: '2026-09-01', account: '', memo: '' },
    // No default account in the books (no earlier write-off, no Bad debts account).
    noDefault: { date: WRITE_OFF_TODAY, account: '', memo: '' },
} satisfies Record<string, WriteOffFormFixture>

// The words the reference shows (spec §3.2–§3.6). `{number}`, `{customer}`, `{date}` and
// the amounts stand where the screens fill them in.
export const WRITE_OFF_TEXTS = {
    amountLabel: 'Amount to write off',
    amountWrittenOffLabel: 'Amount written off',
    reasonPlaceholder: 'Why the balance will not be collected',
    staysPosted: 'The invoice stays posted. Its balance due becomes $0.00.',
    taxStaysOwed: 'Its sales tax of $80.00 stays owed to the tax agency.',
    dateRequired: 'Enter a date',
    dateBeforeInvoice: 'Date the write-off on or after the invoice date, Sep 14, 2026.',
    accountRequired: 'Choose an account',
    noAccount: 'Add an expense account to the chart of accounts',
    loadFailed: 'Books could not load the accounts for the write-off.',
    balanceChanged:
        'The open balance of invoice 1009 is now $300.00. Check it and write it off again.',
    toast: 'Invoice 1009 written off: $400.00',
    invoiceRefused: 'This invoice is written off. Void the write-off first.',
    sectionLoadFailed: 'Books could not load the write-offs of this invoice.',
    voidBody: "The invoice's balance due rises by $400.00 again.",
    voidConfirm: 'Void write-off',
    loadError: 'Books could not load this write-off.',
    notFound: 'This write-off does not exist',
    notChanged: 'A write-off is not changed. Void it and write the invoice off again.',
    transactionsEmpty: 'No write-offs for this customer',
} as const

export const NO_WRITE_OFFS: WriteOffRecord[] = []
