// Synthetic data for the Sales lists (spec docs/specs/sales-lists-design.md): the helix
// reference route reads it directly. Customers come from customer-form-fixture.ts
// (fixture ids; a seed maps them to the server's ids).
//
// Every row is typed with `satisfies` against the generated row types, so tsc checks
// every column the lists read. The document ids are valid PocketBase ids (15 characters),
// so a seed can send them.

import type {
    BooksCreditMemos,
    BooksEstimates,
    BooksInvoices,
    BooksPayments,
    BooksSalesReceipts,
} from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'

// The day the reference is drawn on: Overdue and Expired are computed against it.
export const SALES_LIST_TODAY = '2026-11-16'

export const SALES_LIST_CURRENCY = 'USD'

const STAMP = '2026-11-01 09:00:00.000Z'

type InvoiceRow = Pick<
    BooksInvoices,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'due_date'
    | 'memo'
    | 'total'
    | 'balance'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type EstimateRow = Pick<
    BooksEstimates,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'expiration_date'
    | 'memo'
    | 'total'
    | 'currency'
    | 'created'
>
type SalesReceiptRow = Pick<
    BooksSalesReceipts,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'memo'
    | 'total'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type PaymentRow = Pick<
    BooksPayments,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'reference_no'
    | 'memo'
    | 'amount'
    | 'applied'
    | 'credited'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type CreditMemoRow = Pick<
    BooksCreditMemos,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'memo'
    | 'total'
    | 'balance'
    | 'currency'
    | 'created'
>

type Seed<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Row>

// A draft has no number: `number` is '' and `sequence` is 0 (spec §4), so a draft sorts
// first in ascending No. order.
function sequenceOf(number: string): number {
    return number === '' ? 0 : Number(number)
}

function invoice(
    seed: Seed<InvoiceRow, 'id' | 'customer' | 'status' | 'number' | 'date' | 'due_date' | 'total'>
): InvoiceRow {
    return {
        sequence: sequenceOf(seed.number),
        memo: '',
        currency: SALES_LIST_CURRENCY,
        replaced_by: '',
        created: STAMP,
        // What posting writes: a posted invoice is open for its total until a payment or a
        // credit lowers it. A draft or a void one has no balance.
        balance: seed.status === 'posted' ? seed.total : 0,
        ...seed,
    }
}

function estimate(
    seed: Seed<
        EstimateRow,
        'id' | 'customer' | 'status' | 'number' | 'date' | 'expiration_date' | 'total'
    >
): EstimateRow {
    return {
        sequence: sequenceOf(seed.number),
        memo: '',
        currency: SALES_LIST_CURRENCY,
        created: STAMP,
        ...seed,
    }
}

function receipt(
    seed: Seed<SalesReceiptRow, 'id' | 'customer' | 'status' | 'number' | 'date' | 'total'>
): SalesReceiptRow {
    return {
        sequence: sequenceOf(seed.number),
        memo: '',
        currency: SALES_LIST_CURRENCY,
        replaced_by: '',
        created: STAMP,
        ...seed,
    }
}

function payment(
    seed: Seed<PaymentRow, 'id' | 'customer' | 'status' | 'number' | 'date' | 'amount'>
): PaymentRow {
    return {
        sequence: sequenceOf(seed.number),
        reference_no: '',
        memo: '',
        // A posted payment is applied in full unless the row says what was kept as a credit.
        applied: seed.status === 'posted' ? seed.amount - (seed.credited ?? 0) : 0,
        credited: 0,
        currency: SALES_LIST_CURRENCY,
        replaced_by: '',
        created: STAMP,
        ...seed,
    }
}

function creditMemo(
    seed: Seed<CreditMemoRow, 'id' | 'customer' | 'status' | 'number' | 'date' | 'total'>
): CreditMemoRow {
    return {
        sequence: sequenceOf(seed.number),
        memo: '',
        currency: SALES_LIST_CURRENCY,
        created: STAMP,
        // What posting writes: the whole credit is unapplied until it is applied.
        balance: seed.status === 'posted' ? seed.total : 0,
        ...seed,
    }
}

const HARBOR = CUSTOMER_IDS.harborview
const HARBOR_KITCHEN = CUSTOMER_IDS.harborviewKitchen
const NORTHWIND = CUSTOMER_IDS.northwind
const NORTHWIND_SEATTLE = CUSTOMER_IDS.northwindSeattle
const ALVAREZ = CUSTOMER_IDS.alvarez
// Long names, for truncation.
const ST_JUDE = CUSTOMER_IDS.stJude
const ST_JUDE_GALA = CUSTOMER_IDS.stJudeGala
// An inactive customer: its documents stay listed and the customer picker offers it.
const OLD_MILL = CUSTOMER_IDS.oldMill

// Every invoice badge: Draft, Open, Partly paid, Overdue, Paid, Void. Amounts are cents.
// - 1043 was corrected: the void original (replaced_by set) is not listed, its
//   correction carries the number.
// - 1047 and 1049 share 2026-11-09, so the `created` tie-break shows (1049 is newer).
// - 999 and 1012 show the numeric No. order (999 before 1012).
// - 1012 has no due date and no memo: both cells show "—", and it stays Open.
// - The draft has no number.
export const SALES_LIST_INVOICES = [
    invoice({
        id: 'slinv00000draft',
        customer: HARBOR,
        status: 'draft',
        number: '',
        date: '2026-11-15',
        due_date: '2026-12-15',
        memo: 'December retainer',
        total: 240_000,
        created: '2026-11-15 08:30:00.000Z',
    }),
    invoice({
        id: 'slinv0000001048',
        customer: NORTHWIND,
        status: 'posted',
        number: '1048',
        date: '2026-11-14',
        due_date: '2026-12-14',
        memo: 'November retainer',
        total: 240_000,
    }),
    invoice({
        id: 'slinv0000001049',
        customer: HARBOR,
        status: 'posted',
        number: '1049',
        date: '2026-11-09',
        due_date: '2026-12-09',
        memo: 'Event staffing, harvest dinner',
        total: 98_000,
        created: '2026-11-09 16:20:00.000Z',
    }),
    invoice({
        id: 'slinv0000001047',
        customer: ALVAREZ,
        status: 'posted',
        number: '1047',
        date: '2026-11-09',
        due_date: '2026-11-30',
        memo: 'Kitchen remodel, phase 2: cabinets and counters',
        total: 615_000,
        balance: 315_000,
        created: '2026-11-09 10:05:00.000Z',
    }),
    invoice({
        id: 'slinv0000001046',
        customer: ST_JUDE,
        status: 'posted',
        number: '1046',
        date: '2026-09-30',
        due_date: '2026-10-30',
        memo: 'Catering for the autumn donor dinner, 240 guests, with the late change to the vegetarian menu and a second bar',
        total: 12_480_000,
    }),
    invoice({
        id: 'slinv0000001045',
        customer: HARBOR_KITCHEN,
        status: 'posted',
        number: '1045',
        date: '2026-09-22',
        due_date: '2026-10-22',
        memo: 'Menu boards',
        total: 86_000,
        balance: 0,
    }),
    invoice({
        id: 'slinv0000001044',
        customer: NORTHWIND,
        status: 'void',
        number: '1044',
        date: '2026-08-28',
        due_date: '2026-09-27',
        memo: 'Entered twice',
        total: 31_000,
    }),
    invoice({
        id: 'slinv0001043fix',
        customer: HARBOR,
        status: 'posted',
        number: '1043',
        date: '2026-08-20',
        due_date: '2026-09-19',
        memo: 'Corrected quantity',
        total: 342_575,
    }),
    invoice({
        id: 'slinv0001043old',
        customer: HARBOR,
        status: 'void',
        number: '1043',
        date: '2026-08-20',
        due_date: '2026-09-19',
        memo: 'Corrected quantity',
        total: 324_575,
        replaced_by: 'slinv0001043fix',
    }),
    invoice({
        id: 'slinv0000001012',
        customer: OLD_MILL,
        status: 'posted',
        number: '1012',
        date: '2026-07-02',
        due_date: '',
        total: 12_500,
    }),
    invoice({
        id: 'slinv0000000999',
        customer: NORTHWIND_SEATTLE,
        status: 'posted',
        number: '999',
        date: '2026-07-01',
        due_date: '2026-07-31',
        memo: 'Pallet racking',
        total: 192_475,
        balance: 0,
    }),
] satisfies Partial<BooksInvoices>[]

// Every estimate badge: Pending, Accepted, Rejected, Closed, and Expired twice (a Pending
// and an Accepted one past their date). 84 has no expiration date ("—"). 85 has the
// widest amount of the fixture.
export const SALES_LIST_ESTIMATES = [
    estimate({
        id: 'slest0000000088',
        customer: ST_JUDE_GALA,
        status: 'pending',
        number: '88',
        date: '2026-11-06',
        expiration_date: '2026-12-06',
        memo: 'Lobby signage for three buildings',
        total: 1_248_000,
    }),
    estimate({
        id: 'slest0000000087',
        customer: HARBOR,
        status: 'accepted',
        number: '87',
        date: '2026-10-28',
        expiration_date: '2026-11-27',
        memo: 'Patio banners',
        total: 94_000,
    }),
    estimate({
        id: 'slest0000000086',
        customer: ALVAREZ,
        status: 'pending',
        number: '86',
        date: '2026-09-03',
        expiration_date: '2026-10-03',
        memo: 'Deck refinish',
        total: 420_000,
    }),
    estimate({
        id: 'slest0000000085',
        customer: NORTHWIND,
        status: 'rejected',
        number: '85',
        date: '2026-08-11',
        expiration_date: '2026-09-10',
        memo: 'Forklift lease, 36 months',
        total: 123_456_789,
    }),
    estimate({
        id: 'slest0000000084',
        customer: HARBOR_KITCHEN,
        status: 'closed',
        number: '84',
        date: '2026-07-19',
        expiration_date: '',
        memo: 'Hood cleaning',
        total: 68_000,
    }),
    estimate({
        id: 'slest0000000083',
        customer: OLD_MILL,
        status: 'accepted',
        number: '83',
        date: '2026-07-01',
        expiration_date: '2026-07-30',
        memo: 'Bread racks',
        total: 57_500,
    }),
] satisfies Partial<BooksEstimates>[]

// Every sales receipt badge: Paid, Draft, Void. 205 has no customer ("—"); the draft has
// no number and no memo.
export const SALES_LIST_SALES_RECEIPTS = [
    receipt({
        id: 'slsr000000draft',
        customer: ALVAREZ,
        status: 'draft',
        number: '',
        date: '2026-11-13',
        total: 12_500,
        created: '2026-11-13 14:00:00.000Z',
    }),
    receipt({
        id: 'slsr00000000205',
        customer: '',
        status: 'posted',
        number: '205',
        date: '2026-11-05',
        memo: 'Counter sale',
        total: 7_420,
    }),
    receipt({
        id: 'slsr00000000204',
        customer: HARBOR_KITCHEN,
        status: 'posted',
        number: '204',
        date: '2026-10-19',
        memo: 'Gift cards, 12 at $50',
        total: 60_000,
    }),
    receipt({
        id: 'slsr00000000203',
        customer: NORTHWIND,
        status: 'void',
        number: '203',
        date: '2026-09-15',
        memo: 'Wrong deposit account',
        total: 30_000,
    }),
] satisfies Partial<BooksSalesReceipts>[]

// Every payment badge: Applied, "Credit $x" (311 kept $100.00 as a credit), Draft, Void.
// 311 has a long reference number; the draft has none ("—").
export const SALES_LIST_PAYMENTS = [
    payment({
        id: 'slpay00000draft',
        customer: HARBOR,
        status: 'draft',
        number: '',
        date: '2026-11-15',
        amount: 98_000,
        created: '2026-11-15 09:10:00.000Z',
    }),
    payment({
        id: 'slpay0000000312',
        customer: ALVAREZ,
        status: 'posted',
        number: '312',
        date: '2026-11-12',
        reference_no: 'Check 2207',
        amount: 300_000,
    }),
    payment({
        id: 'slpay0000000311',
        customer: NORTHWIND,
        status: 'posted',
        number: '311',
        date: '2026-11-02',
        reference_no: 'ACH 88-104-5521-0093, Northwind accounts payable run 44',
        memo: 'Paid $100.00 over',
        amount: 250_000,
        credited: 10_000,
    }),
    payment({
        id: 'slpay0000000310',
        customer: HARBOR_KITCHEN,
        status: 'void',
        number: '310',
        date: '2026-10-05',
        reference_no: 'Check 1988',
        memo: 'Check returned',
        amount: 86_000,
    }),
    payment({
        id: 'slpay0000000309',
        customer: HARBOR_KITCHEN,
        status: 'posted',
        number: '309',
        date: '2026-09-25',
        reference_no: 'Card ending 4411',
        amount: 86_000,
    }),
] satisfies Partial<BooksPayments>[]

// Every credit memo badge: Unapplied, Refunded, Draft, Void. Totals are stored positive;
// All sales shows them negative.
export const SALES_LIST_CREDIT_MEMOS = [
    creditMemo({
        id: 'slcm000000draft',
        customer: ST_JUDE,
        status: 'draft',
        number: '',
        date: '2026-11-16',
        total: 5_000,
        created: '2026-11-16 08:00:00.000Z',
    }),
    creditMemo({
        id: 'slcm00000000027',
        customer: ALVAREZ,
        status: 'posted',
        number: '27',
        date: '2026-11-11',
        memo: 'Returned display stand',
        total: 40_000,
    }),
    creditMemo({
        id: 'slcm00000000026',
        customer: NORTHWIND,
        status: 'posted',
        number: '26',
        date: '2026-10-08',
        memo: 'Price adjustment on invoice 1041',
        total: 15_000,
        balance: 0,
    }),
    creditMemo({
        id: 'slcm00000000025',
        customer: HARBOR,
        status: 'void',
        number: '25',
        date: '2026-08-30',
        memo: 'Issued to the wrong customer',
        total: 22_000,
    }),
] satisfies Partial<BooksCreditMemos>[]

// The names the Customer cell and the customer picker read: every fixture customer,
// sub-customers and inactive ones included (spec §3, the customer picker).
export const SALES_LIST_CUSTOMERS = CUSTOMERS.map(customer => ({
    id: customer.id,
    display_name: customer.display_name,
    inactive: customer.inactive,
}))

// The customer of the reference's "filtered" states.
export const SALES_LIST_FILTER_CUSTOMER = NORTHWIND

// The invoice the reference shows open beside its list (the 1360 px surface).
export const SALES_LIST_OPEN_INVOICE = 'slinv0000001047'

// The rows the reference ticks for the batch states: two drafts, two posted documents and
// an estimate, so "Delete drafts" applies to two and skips three, and "Void" applies to
// two and never to the estimate.
export const SALES_LIST_TICKED = [
    'slinv00000draft',
    'slpay00000draft',
    'slinv0000001048',
    'slcm00000000027',
    'slest0000000088',
]

// What the server answers when it refuses a void, for the batch result banner.
export const SALES_LIST_REFUSAL =
    'Invoice 1048 has a payment applied to it. Void the payment first.'

const draftsOf = <Row extends { status: string }>(rows: readonly Row[]) =>
    rows.filter(row => row.status === 'draft')

// The rows the e2e seed creates (seed.ts `seedSalesListDrafts`): drafts only, because a
// posted row moves the ledger totals that report specs assert, and no estimate, because
// `seedDeclinedEstimates` expects the estimate numbers. Every fixture date is after
// 2026-06-30, the close date books-settings.spec.ts holds on the shared e2e database.
export const SALES_LIST_SEED_DRAFTS = {
    invoices: draftsOf(SALES_LIST_INVOICES),
    salesReceipts: draftsOf(SALES_LIST_SALES_RECEIPTS),
    payments: draftsOf(SALES_LIST_PAYMENTS),
    creditMemos: draftsOf(SALES_LIST_CREDIT_MEMOS),
}
