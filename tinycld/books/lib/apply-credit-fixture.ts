// Synthetic credit memo applications for the helix reference route, the seed (seed.ts) and
// tests. Plain data: it imports other fixtures and types only, because the seed graph runs
// in plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). The rows are the books AFTER the applications
// below (apply-credit spec §3.5, §3.6):
//   an invoice's `balance` = total − posted payments − credit applications − write-offs;
//   a credit memo's `balance` = total − `applied` − posted refund payouts;
//   a credit memo's `applied` = the sum of its applications.
//
// `ApplyCreditInvoiceRecord` and `ApplyCreditPaymentRecord` are the generated `BooksInvoices`
// and `BooksPayments`, so the `satisfies` checks hold those rows to the real schema.
//
// Two shapes do not exist in the schema yet. The checkpoint that adds migration
// `<next free number>_create_books_credit_memo_applications.js` and edits 2100000022
// (`books_credit_memos.applied`) must replace both with the generated types
// (`BooksCreditMemoApplications`, and `BooksCreditMemos` with `applied`), so tsc checks
// every field of these rows:
//   - `CreditMemoApplicationRecord` (spec §4.1);
//   - the `applied` field of `ApplyCreditMemoRecord` (spec §4.2).

import type { BooksCreditMemos, BooksInvoices, BooksPayments } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { INVOICE_USER_IDS, INVOICE_USER_NAMES } from './invoice-form-fixture'

export const APPLY_CREDIT_CURRENCY = 'USD'
// "Today" for the reference captures, so the default apply date and the overdue marks are
// stable.
export const APPLY_CREDIT_TODAY = '2026-11-19'
// The settings' close date of the "closed period" refusal.
export const APPLY_CREDIT_CLOSE_DATE = '2026-09-30'

const STAMP = '2026-11-19 09:00:00.000Z'

export const APPLY_CREDIT_USER_IDS = INVOICE_USER_IDS
export const APPLY_CREDIT_USER_NAMES = INVOICE_USER_NAMES

export type ApplyCreditInvoiceRecord = BooksInvoices
export type ApplyCreditPaymentRecord = BooksPayments

// Spec §4.2. Local until the migration checkpoint adds `applied` to `books_credit_memos`;
// then this is `BooksCreditMemos`.
export type ApplyCreditMemoRecord = BooksCreditMemos & { applied: number }

// Spec §4.1. Local until the migration checkpoint creates
// `books_credit_memo_applications`; then this is `BooksCreditMemoApplications`.
export interface CreditMemoApplicationRecord {
    id: string
    credit_memo: string
    invoice: string
    amount: number
    // The apply date, an ISO day.
    date: string
    applied_by: string
    close_override: string
    created: string
}

export const APPLY_CREDIT_CUSTOMER_IDS = {
    // Unapplied credit on two credit memos, three open invoices (one overdue), and a
    // payment with an amount that is not applied.
    foxHollow: 'cust_fox_000001',
    // One credit memo applied in full over two invoices.
    juniper: 'cust_juni_00001',
    // One invoice paid by a payment, a credit and a write-off; its credit memo is partly
    // applied and partly refunded.
    cedarPine: 'cust_cedar_0001',
    // A long name, long document numbers and large amounts.
    stJude: CUSTOMER_IDS.stJude,
    // Unapplied credit and no open invoice (the dialog's empty state).
    granitePeak: 'cust_grnt_00001',
} as const

const CUSTOMER = APPLY_CREDIT_CUSTOMER_IDS

export function applyCreditCustomerName(customerId: string): string {
    return CUSTOMERS.find(row => row.id === customerId)?.display_name ?? ''
}

export const APPLY_CREDIT_INVOICE_IDS = {
    // Fox Hollow 1009: $400.00, overdue; credit memo 1001 was made from it and pays $150.00
    // of it, so it stays open for $250.00.
    part: 'invcac1009foxh1',
    // Fox Hollow 1012: $620.00, due today.
    dueToday: 'invcac1012foxh1',
    // Fox Hollow 1015: $1,180.50, not due yet.
    notDue: 'invcac1015foxh1',
    // Juniper 1016: $300.00, paid in full by credit memo 1003 (reads Paid).
    paidByCredit: 'invcac1016juni1',
    // Juniper 1017: $450.00, $200.00 paid by credit memo 1003; open for $250.00.
    partByCredit: 'invcac1017juni1',
    // Cedar & Pine 1020: $1,000.00 = payment $500.00 + credit $300.00 + write-off $200.00.
    mixed: 'invcac1020cedr1',
    // St. Jude: a long number and a large open balance.
    long: 'invcaclongstjd1',
} as const

const INV = APPLY_CREDIT_INVOICE_IDS

type InvoiceSeed = Pick<
    ApplyCreditInvoiceRecord,
    'id' | 'customer' | 'number' | 'date' | 'due_date' | 'total' | 'balance'
> &
    Partial<ApplyCreditInvoiceRecord>

function invoice(seed: InvoiceSeed): ApplyCreditInvoiceRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`apply-credit fixture: ${seed.id} names an unknown customer`)
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
        currency: APPLY_CREDIT_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        estimate: '',
        posted_by: APPLY_CREDIT_USER_IDS.ana,
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

export const APPLY_CREDIT_INVOICES = [
    invoice({
        id: INV.part,
        customer: CUSTOMER.foxHollow,
        number: '1009',
        date: '2026-09-14',
        due_date: '2026-10-14',
        total: 40_000,
        balance: 25_000,
        memo: 'Autumn menu tasting, 12 guests',
        entry: 'jeinvoiceac1009',
    }),
    invoice({
        id: INV.dueToday,
        customer: CUSTOMER.foxHollow,
        number: '1012',
        date: '2026-10-20',
        due_date: APPLY_CREDIT_TODAY,
        total: 62_000,
        balance: 62_000,
        entry: 'jeinvoiceac1012',
    }),
    invoice({
        id: INV.notDue,
        customer: CUSTOMER.foxHollow,
        number: '1015',
        date: '2026-11-05',
        due_date: '2026-12-05',
        total: 118_050,
        balance: 118_050,
        entry: 'jeinvoiceac1015',
    }),
    invoice({
        id: INV.paidByCredit,
        customer: CUSTOMER.juniper,
        number: '1016',
        date: '2026-10-01',
        due_date: '2026-10-31',
        total: 30_000,
        balance: 0,
        entry: 'jeinvoiceac1016',
    }),
    invoice({
        id: INV.partByCredit,
        customer: CUSTOMER.juniper,
        number: '1017',
        date: '2026-10-15',
        due_date: '2026-11-14',
        total: 45_000,
        balance: 25_000,
        entry: 'jeinvoiceac1017',
    }),
    invoice({
        id: INV.mixed,
        customer: CUSTOMER.cedarPine,
        number: '1020',
        date: '2026-08-18',
        due_date: '2026-09-17',
        total: 100_000,
        balance: 0,
        written_off: 20_000,
        memo: 'Courtyard planting, phase 1',
        entry: 'jeinvoiceac1020',
    }),
    invoice({
        id: INV.long,
        customer: CUSTOMER.stJude,
        number: 'INV-2026-000104417',
        date: '2026-08-21',
        due_date: '2026-09-20',
        total: 123_456_789,
        balance: 123_456_789,
        memo: 'West Annex renovation, phase 2 catering and site services',
        entry: 'jeinvoiceaclong',
    }),
] satisfies ApplyCreditInvoiceRecord[]

export function applyCreditInvoiceById(invoiceId: string): ApplyCreditInvoiceRecord | undefined {
    return APPLY_CREDIT_INVOICES.find(row => row.id === invoiceId)
}

export const APPLY_CREDIT_MEMO_IDS = {
    // Fox Hollow 1001: $250.00, made from invoice 1009; $150.00 applied to it, $100.00 left.
    partly: 'crmac1001foxh01',
    // Fox Hollow 1002: $80.00, nothing applied.
    unapplied: 'crmac1002foxh01',
    // Juniper 1003: $500.00, applied in full over invoices 1016 and 1017.
    applied: 'crmac1003juni01',
    // Cedar & Pine 1005: $450.00 = $300.00 applied + $100.00 refunded + $50.00 left.
    appliedAndRefunded: 'crmac1005cedr01',
    // Granite Peak 1006: $120.00; the customer has no open invoice.
    noInvoice: 'crmac1006grnt01',
    // St. Jude: a long number and a large amount, nothing applied.
    long: 'crmaclongstjd01',
} as const

const MEMO = APPLY_CREDIT_MEMO_IDS

type MemoSeed = Pick<
    ApplyCreditMemoRecord,
    'id' | 'customer' | 'number' | 'date' | 'total' | 'applied' | 'balance'
> &
    Partial<ApplyCreditMemoRecord>

function memo(seed: MemoSeed): ApplyCreditMemoRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`apply-credit fixture: ${seed.id} names an unknown customer`)
    return {
        status: 'posted',
        sequence: Number.parseInt(seed.number, 10) || 0,
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        message: '',
        memo: '',
        subtotal: seed.total,
        tax_total: 0,
        revision: 1,
        currency: APPLY_CREDIT_CURRENCY,
        entry: '',
        invoice: '',
        replaces: '',
        replaced_by: '',
        posted_by: APPLY_CREDIT_USER_IDS.ana,
        posted_at: `${seed.date} 17:00:00.000Z`,
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

export const APPLY_CREDIT_MEMOS = [
    memo({
        id: MEMO.partly,
        customer: CUSTOMER.foxHollow,
        number: '1001',
        date: '2026-11-12',
        total: 25_000,
        applied: 15_000,
        balance: 10_000,
        invoice: INV.part,
        message: 'Credit for the two guests who did not attend.',
        memo: 'Agreed with Lena by phone, Nov 12',
        entry: 'jecreditmac1001',
    }),
    memo({
        id: MEMO.unapplied,
        customer: CUSTOMER.foxHollow,
        number: '1002',
        date: '2026-11-14',
        total: 8_000,
        applied: 0,
        balance: 8_000,
        memo: 'Corkage charged twice in October',
        entry: 'jecreditmac1002',
    }),
    memo({
        id: MEMO.applied,
        customer: CUSTOMER.juniper,
        number: '1003',
        date: '2026-11-10',
        total: 50_000,
        applied: 50_000,
        balance: 0,
        memo: 'Returned espresso grinder',
        entry: 'jecreditmac1003',
    }),
    memo({
        id: MEMO.appliedAndRefunded,
        customer: CUSTOMER.cedarPine,
        number: '1005',
        date: '2026-10-02',
        total: 45_000,
        applied: 30_000,
        balance: 5_000,
        memo: 'Plants that did not survive the first month',
        entry: 'jecreditmac1005',
        posted_by: APPLY_CREDIT_USER_IDS.omar,
    }),
    memo({
        id: MEMO.noInvoice,
        customer: CUSTOMER.granitePeak,
        number: '1006',
        date: '2026-11-15',
        total: 12_000,
        applied: 0,
        balance: 12_000,
        entry: 'jecreditmac1006',
    }),
    memo({
        id: MEMO.long,
        customer: CUSTOMER.stJude,
        number: 'CM-2026-000000318',
        date: '2026-11-01',
        total: 98_765_432,
        applied: 0,
        balance: 98_765_432,
        memo: 'West Annex renovation, phase 2: services the foundation cancelled in writing',
        entry: 'jecreditmaclong',
    }),
] satisfies ApplyCreditMemoRecord[]

export function applyCreditMemoById(memoId: string): ApplyCreditMemoRecord | undefined {
    return APPLY_CREDIT_MEMOS.find(row => row.id === memoId)
}

export const CREDIT_MEMO_APPLICATION_IDS = {
    // $150.00 of credit memo 1001 on the invoice it was made from (1009), Nov 16.
    part: 'cmapp1001to1009',
    // Credit memo 1003 over two invoices, Nov 11: $300.00 and $200.00.
    fullFirst: 'cmapp1003to1016',
    fullSecond: 'cmapp1003to1017',
    // $300.00 of credit memo 1005 on invoice 1020, Oct 5.
    mixed: 'cmapp1005to1020',
} as const

const APP = CREDIT_MEMO_APPLICATION_IDS

function application(
    seed: Pick<CreditMemoApplicationRecord, 'id' | 'credit_memo' | 'invoice' | 'amount' | 'date'>
): CreditMemoApplicationRecord {
    return {
        applied_by: APPLY_CREDIT_USER_IDS.ana,
        close_override: '',
        created: `${seed.date} 18:00:00.000Z`,
        ...seed,
    }
}

export const CREDIT_MEMO_APPLICATIONS: CreditMemoApplicationRecord[] = [
    application({
        id: APP.part,
        credit_memo: MEMO.partly,
        invoice: INV.part,
        amount: 15_000,
        date: '2026-11-16',
    }),
    application({
        id: APP.fullFirst,
        credit_memo: MEMO.applied,
        invoice: INV.paidByCredit,
        amount: 30_000,
        date: '2026-11-11',
    }),
    application({
        id: APP.fullSecond,
        credit_memo: MEMO.applied,
        invoice: INV.partByCredit,
        amount: 20_000,
        date: '2026-11-11',
    }),
    application({
        id: APP.mixed,
        credit_memo: MEMO.appliedAndRefunded,
        invoice: INV.mixed,
        amount: 30_000,
        date: '2026-10-05',
    }),
]

// A credit memo's applications, oldest apply date first (its Applied to block, §3.5).
export function applicationsOfMemo(memoId: string): CreditMemoApplicationRecord[] {
    return CREDIT_MEMO_APPLICATIONS.filter(row => row.credit_memo === memoId).sort((a, b) =>
        a.date.localeCompare(b.date)
    )
}

// An invoice's applications, oldest apply date first (its Payments block, §3.6).
export function applicationsOfInvoice(invoiceId: string): CreditMemoApplicationRecord[] {
    return CREDIT_MEMO_APPLICATIONS.filter(row => row.invoice === invoiceId).sort((a, b) =>
        a.date.localeCompare(b.date)
    )
}

export const APPLY_CREDIT_PAYMENT_IDS = {
    // Fox Hollow payment 1004: $100.00 received, nothing applied (spec §3.1, Q2).
    notApplied: 'paymac1004foxh1',
    // Cedar & Pine payment 1006: $500.00 applied to invoice 1020.
    mixed: 'paymac1006cedr1',
} as const

type PaymentSeed = Pick<
    ApplyCreditPaymentRecord,
    'id' | 'customer' | 'number' | 'date' | 'amount' | 'applied' | 'credited'
> &
    Partial<ApplyCreditPaymentRecord>

function payment(seed: PaymentSeed): ApplyCreditPaymentRecord {
    return {
        status: 'posted',
        sequence: Number.parseInt(seed.number, 10) || 0,
        payment_method: 'check',
        reference_no: '',
        deposit_to: '',
        memo: '',
        currency: APPLY_CREDIT_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: APPLY_CREDIT_USER_IDS.ana,
        posted_at: `${seed.date} 15:00:00.000Z`,
        voided_by: '',
        voided_at: '',
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const APPLY_CREDIT_PAYMENTS = [
    payment({
        id: APPLY_CREDIT_PAYMENT_IDS.notApplied,
        customer: CUSTOMER.foxHollow,
        number: '1004',
        date: '2026-10-28',
        amount: 10_000,
        applied: 0,
        credited: 10_000,
        reference_no: '2291',
        entry: 'jepaymentac1004',
    }),
    payment({
        id: APPLY_CREDIT_PAYMENT_IDS.mixed,
        customer: CUSTOMER.cedarPine,
        number: '1006',
        date: '2026-09-10',
        amount: 50_000,
        applied: 50_000,
        credited: 0,
        entry: 'jepaymentac1006',
    }),
] satisfies ApplyCreditPaymentRecord[]

// A customer's posted payments with an amount that is not applied, oldest first (§3.1).
export function unappliedPaymentsOf(customerId: string): ApplyCreditPaymentRecord[] {
    return APPLY_CREDIT_PAYMENTS.filter(
        row => row.customer === customerId && row.status === 'posted' && row.credited > 0
    ).sort((a, b) => a.date.localeCompare(b.date))
}

// What else lowers a document besides the applications: a posted payment applied to an
// invoice, a posted write-off of an invoice, a posted refund receipt that pays a credit
// memo out. The read views show each as one link row.
export interface ApplyCreditLinkedRow {
    id: string
    // The invoice or the credit memo the row lowers.
    document: string
    // The payment, write-off or refund receipt the row opens.
    source: string
    number: string
    date: string
    amount: number
}

export const APPLY_CREDIT_INVOICE_PAYMENTS: ApplyCreditLinkedRow[] = [
    {
        id: 'papac1006cedr01',
        document: INV.mixed,
        source: APPLY_CREDIT_PAYMENT_IDS.mixed,
        number: '1006',
        date: '2026-09-10',
        amount: 50_000,
    },
]

export const APPLY_CREDIT_WRITE_OFFS: ApplyCreditLinkedRow[] = [
    {
        id: 'wofac1002cedr01',
        document: INV.mixed,
        source: 'wofac1002cedr01',
        number: '1002',
        date: '2026-11-10',
        amount: 20_000,
    },
]

export const APPLY_CREDIT_REFUNDS: ApplyCreditLinkedRow[] = [
    {
        id: 'rrcac1003cedr01',
        document: MEMO.appliedAndRefunded,
        source: 'rfrac1003cedr01',
        number: '1003',
        date: '2026-10-20',
        amount: 10_000,
    },
]

export function linkedRowsOf(
    rows: readonly ApplyCreditLinkedRow[],
    documentId: string
): ApplyCreditLinkedRow[] {
    return rows.filter(row => row.document === documentId)
}

// A customer's open invoices in the dialog's order (§3.2): by due date, then number. The
// dialog moves the invoice the credit memo was made from to the top.
export function openInvoicesOf(customerId: string): ApplyCreditInvoiceRecord[] {
    return APPLY_CREDIT_INVOICES.filter(
        row => row.customer === customerId && row.status === 'posted' && row.balance > 0
    ).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number))
}

// A customer's posted credit memos with unapplied credit, by credit date, then number
// (§3.3).
export function unappliedMemosOf(customerId: string): ApplyCreditMemoRecord[] {
    return APPLY_CREDIT_MEMOS.filter(
        row => row.customer === customerId && row.status === 'posted' && row.balance > 0
    ).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
}

// What the seed writes (spec §4.5): one new invoice, one new credit memo and one
// application of a part of the memo to that invoice, through the dialog's writes. The plan
// picks the seeded customer and the days after its grep of the report and list specs; these
// are the fixture's rows for the three.
export const APPLY_CREDIT_SEED = {
    invoice: INV.part,
    creditMemo: MEMO.partly,
    application: APP.part,
} as const

// One row of an apply dialog: an open invoice (from a credit memo) or a credit memo with
// unapplied credit (from an invoice). `open` is what the row may take; `due_date` is the
// due date of an invoice and the credit date of a credit memo. The shape of
// `OutstandingRow` (lib/payment-allocation.ts).
export interface ApplyDialogRow {
    id: string
    number: string
    date: string
    due_date: string
    total: number
    open: number
}

/** One apply dialog as the reference shows it (spec §3.2–§3.4). */
export interface ApplyDialogFixture {
    // The fixed side: a credit memo ('credit') or an invoice ('document').
    from: 'credit' | 'document'
    title: string
    customer: string
    figureLabel: string
    // The fixed side's amount: the unapplied credit, or the invoice's open balance.
    figure: number
    date: string
    rows: ApplyDialogRow[]
    // The Credit to apply cells' text, by row id; a row with no entry is not ticked.
    amounts: Record<string, string>
    summary: string
    rowErrors: Record<string, string>
    dateError: string
    rootError: string
    // From an invoice: the payments line of §3.1 under the list.
    showsPayments: boolean
}

function invoiceRow(invoiceId: string, open: number): ApplyDialogRow {
    const row = applyCreditInvoiceById(invoiceId)
    if (!row) throw new Error(`apply-credit fixture: no invoice ${invoiceId}`)
    return {
        id: row.id,
        number: row.number,
        date: row.date,
        due_date: row.due_date,
        total: row.total,
        open,
    }
}

function memoRow(memoId: string, open: number): ApplyDialogRow {
    const row = applyCreditMemoById(memoId)
    if (!row) throw new Error(`apply-credit fixture: no credit memo ${memoId}`)
    return {
        id: row.id,
        number: row.number,
        date: row.date,
        due_date: row.date,
        total: row.total,
        open,
    }
}

// Fox Hollow before application `part`: credit memo 1001 holds $250.00 and invoice 1009 is
// open for $400.00. The invoice the memo was made from is first.
const FOX_INVOICES = [
    invoiceRow(INV.part, 40_000),
    invoiceRow(INV.dueToday, 62_000),
    invoiceRow(INV.notDue, 118_050),
]
const FOX_MEMOS = [memoRow(MEMO.partly, 25_000), memoRow(MEMO.unapplied, 8_000)]

const NO_ERRORS = { rowErrors: {}, dateError: '', rootError: '' }

const FROM_MEMO = {
    from: 'credit',
    title: 'Apply credit memo 1001',
    customer: CUSTOMER.foxHollow,
    figureLabel: 'Unapplied credit',
    figure: 25_000,
    date: APPLY_CREDIT_TODAY,
    rows: FOX_INVOICES,
    showsPayments: false,
} satisfies Partial<ApplyDialogFixture>

const FROM_INVOICE = {
    from: 'document',
    title: 'Apply credit to invoice 1009',
    customer: CUSTOMER.foxHollow,
    figureLabel: 'Open balance',
    figure: 40_000,
    date: APPLY_CREDIT_TODAY,
    rows: FOX_MEMOS,
    showsPayments: true,
} satisfies Partial<ApplyDialogFixture>

export const APPLY_DIALOG_STATES = {
    // As the dialog opens from credit memo 1001: the whole credit on the invoice it was
    // made from.
    memoOpened: {
        ...FROM_MEMO,
        amounts: { [INV.part]: '250.00' },
        summary: 'Applying $250.00 to 1 invoice · $0.00 stays unapplied',
        ...NO_ERRORS,
    },
    // A part of the invoice and a part of the credit: $150.00 typed.
    memoPart: {
        ...FROM_MEMO,
        amounts: { [INV.part]: '150.00' },
        summary: 'Applying $150.00 to 1 invoice · $100.00 stays unapplied',
        ...NO_ERRORS,
    },
    // The credit spread over two invoices by a second tick.
    memoSpread: {
        ...FROM_MEMO,
        amounts: { [INV.part]: '150.00', [INV.dueToday]: '100.00' },
        summary: 'Applying $250.00 to 2 invoices · $0.00 stays unapplied',
        ...NO_ERRORS,
    },
    // A date before the credit date, a row above its open balance, a row the server
    // refused, and a sum above the credit.
    memoErrors: {
        ...FROM_MEMO,
        date: '2026-11-10',
        amounts: { [INV.part]: '450.00', [INV.dueToday]: '100.00' },
        summary: 'Applying $550.00 to 2 invoices · $0.00 stays unapplied',
        rowErrors: {
            [INV.part]: 'More than the open balance of $400.00',
            [INV.dueToday]: 'Invoice 1012 is not open. Clear it to continue.',
        },
        dateError: "The apply date can't be before the credit date.",
        rootError: 'More than the unapplied credit of $250.00.',
    },
    // Long numbers and large amounts.
    memoLong: {
        from: 'credit',
        title: 'Apply credit memo CM-2026-000000318',
        customer: CUSTOMER.stJude,
        figureLabel: 'Unapplied credit',
        figure: 98_765_432,
        date: APPLY_CREDIT_TODAY,
        rows: [invoiceRow(INV.long, 123_456_789)],
        amounts: { [INV.long]: '987,654.32' },
        summary: 'Applying $987,654.32 to 1 invoice · $0.00 stays unapplied',
        showsPayments: false,
        ...NO_ERRORS,
    },
    // No open invoice for the customer (§3.2).
    memoEmpty: {
        from: 'credit',
        title: 'Apply credit memo 1006',
        customer: CUSTOMER.granitePeak,
        figureLabel: 'Unapplied credit',
        figure: 12_000,
        date: APPLY_CREDIT_TODAY,
        rows: [],
        amounts: {},
        summary: '',
        showsPayments: false,
        ...NO_ERRORS,
    },
    // As the dialog opens from invoice 1009: both credit memos, up to the open balance.
    invoiceOpened: {
        ...FROM_INVOICE,
        amounts: { [MEMO.partly]: '250.00', [MEMO.unapplied]: '80.00' },
        summary: 'Applying $330.00 from 2 credit memos · $70.00 stays due',
        ...NO_ERRORS,
    },
    // One credit memo, a part of it.
    invoicePart: {
        ...FROM_INVOICE,
        amounts: { [MEMO.partly]: '150.00' },
        summary: 'Applying $150.00 from 1 credit memo · $250.00 stays due',
        ...NO_ERRORS,
    },
    // A date before a credit memo's date and a row above its unapplied credit.
    invoiceErrors: {
        ...FROM_INVOICE,
        date: '2026-11-13',
        amounts: { [MEMO.partly]: '300.00', [MEMO.unapplied]: '80.00' },
        summary: 'Applying $380.00 from 2 credit memos · $20.00 stays due',
        rowErrors: { [MEMO.partly]: 'More than the unapplied credit of $250.00' },
        dateError:
            "The apply date can't be before the credit date of credit memo 1002, Nov 14, 2026.",
        rootError: '',
    },
    // The last credit memo left the list while the dialog was open (§3.3).
    invoiceNoCredit: {
        ...FROM_INVOICE,
        rows: [],
        amounts: {},
        summary: '',
        showsPayments: false,
        ...NO_ERRORS,
    },
} satisfies Record<string, ApplyDialogFixture>

// The words the reference shows (spec §3.1–§3.7). The names and amounts stand where the
// screens fill them in.
export const APPLY_CREDIT_TEXTS = {
    // "<customer> has <n> open invoices." + this.
    memoNoticeRest: 'Apply this credit to lower what they owe.',
    // "Payment <number> has <amount>" + this.
    paymentsRest:
        'that is not applied to an invoice. Open the payment and edit it to apply that amount.',
    noOpenInvoices:
        'Granite Peak Outfitters has no open invoices. The credit stays on the customer until you post an invoice or refund it.',
    noCredit: 'Fox Hollow Vineyards has no unapplied credit.',
    invoicesLoadFailed: 'Books could not load the open invoices.',
    creditsLoadFailed: "Books could not load the customer's credits.",
    appliedLoadFailed: 'Books could not load the credits applied to this invoice.',
    removeBody:
        "Remove this credit from Invoice 1009? The invoice's balance goes up by $150.00 and the credit is unapplied again.",
    removeRefused: 'The books are closed through Nov 30, 2026. Ask an admin for an override.',
    toastFromMemo: 'Applied $150.00 to 1 invoice',
    toastFromInvoice: 'Applied $150.00 from 1 credit memo',
    memoVoidRefused: 'This credit is applied to invoices. Remove it from those invoices first.',
    invoiceVoidRefused: 'Credit memos are applied to this invoice. Remove them first.',
    notChanged: 'A credit application is not changed. Remove it and apply the credit again.',
} as const

export const NO_CREDIT_MEMO_APPLICATIONS: CreditMemoApplicationRecord[] = []
