// Synthetic data for the Expenses lists (spec docs/specs/purchase-lists-design.md): the
// helix reference route reads it directly. Vendors come from vendor-form-fixture.ts,
// accounts from the seed chart (by number) and products from products-services-fixture.ts.
//
// Every row is typed with `satisfies` against the generated row types, so tsc checks
// every column the lists read. The document ids are valid PocketBase ids (15 characters),
// so a seed can send them. Every date is after 2026-06-30, the close date
// books-settings.spec.ts holds on the shared e2e database, and every memo is unique, so
// a list spec finds one row by its search.
//
// The seed (spec §4 "Seed") creates the rows of PURCHASE_LIST_SEED, below the lines: the
// draft and posted rows the list specs delete, void and filter. The vendors here have no
// document in another fixture's totals, except the two that show an edge (the long name,
// the inactive vendor): the seed posts no document for those.

import type {
    BooksBillLines,
    BooksBillPayments,
    BooksBills,
    BooksExpenseLines,
    BooksExpenses,
    BooksVendorCreditLines,
    BooksVendorCredits,
    BooksVendorRefunds,
} from '../types'
import { PRODUCT_IDS } from './products-services-fixture'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

// The day the reference is drawn on: Overdue is computed against it.
export const PURCHASE_LIST_TODAY = '2026-11-18'

export const PURCHASE_LIST_CURRENCY = 'USD'

const STAMP = '2026-11-01 09:00:00.000Z'

type Common =
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'sequence'
    | 'date'
    | 'currency'
    | 'entry'
    | 'replaced_by'
    | 'created'

type BillRow = Pick<BooksBills, Common | 'due_date' | 'ref_no' | 'memo' | 'total' | 'balance'>
type ExpenseRow = Pick<BooksExpenses, Common | 'reference_no' | 'memo' | 'total'>
// A bill payment has no memo.
type BillPaymentRow = Pick<BooksBillPayments, Common | 'reference_no' | 'total'>
type VendorCreditRow = Pick<BooksVendorCredits, Common | 'ref_no' | 'memo' | 'total' | 'balance'>
type VendorRefundRow = Pick<BooksVendorRefunds, Common | 'reference_no' | 'memo' | 'amount'>

type Seed<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Row>

type Head = 'id' | 'vendor' | 'status' | 'number' | 'date'

// What every kind shares. A draft has no number (`number` '' and `sequence` 0, so it sorts
// first in ascending No. order) and no journal entry; a posted or void document has both.
function common(seed: { id: string; status: string; number: string }) {
    return {
        sequence: seed.number === '' ? 0 : Number(seed.number),
        currency: PURCHASE_LIST_CURRENCY,
        entry: seed.status === 'draft' ? '' : `plje${seed.id.slice(4)}`,
        replaced_by: '',
        created: STAMP,
    }
}

function bill(seed: Seed<BillRow, Head | 'due_date' | 'total'>): BillRow {
    return {
        ...common(seed),
        ref_no: '',
        memo: '',
        // What posting writes: a posted bill is open for its total until a payment or a
        // credit lowers it. A draft or a void one has no balance.
        balance: seed.status === 'posted' ? seed.total : 0,
        ...seed,
    }
}

function expense(seed: Seed<ExpenseRow, Head | 'total'>): ExpenseRow {
    return { ...common(seed), reference_no: '', memo: '', ...seed }
}

function billPayment(seed: Seed<BillPaymentRow, Head | 'total'>): BillPaymentRow {
    return { ...common(seed), reference_no: '', ...seed }
}

function vendorCredit(seed: Seed<VendorCreditRow, Head | 'total'>): VendorCreditRow {
    return {
        ...common(seed),
        ref_no: '',
        memo: '',
        // What posting writes: the whole credit is unapplied until it is applied.
        balance: seed.status === 'posted' ? seed.total : 0,
        ...seed,
    }
}

function vendorRefund(seed: Seed<VendorRefundRow, Head | 'amount'>): VendorRefundRow {
    return { ...common(seed), reference_no: '', memo: '', ...seed }
}

const NW_PAPER = 'vendnwpaper0001'
const ZENITH = 'vendzenithtel01'
const METRO = 'vendmetroprop01'
const KEYSTONE = 'vendkeystonel01'
const BRIGHTWAVE = 'vendbrightwav01'
const GREENLINE = 'vendgreenline01'
// A long name, for truncation.
const WILLAMETTE = VENDOR_IDS.willamette
// An inactive vendor: its documents stay listed and the vendor picker offers it.
const OLD_TOWN = VENDOR_IDS.oldTownPrint

// Every bill badge: Draft, Open, Partly paid, Overdue, Paid, Void. Amounts are cents.
// - 1052 was corrected: the void original (replaced_by set) is not listed, its
//   correction carries the number.
// - 1057 and 1056 share 2026-11-12, so the `created` tie-break shows (1057 is newer).
// - 999 and 1012 show the numeric No. order (999 before 1012).
// - 1012 has no due date, no reference no. and no memo: the cells show "—", and it stays
//   Open.
// - The draft has no number.
export const PURCHASE_LIST_BILLS = [
    bill({
        id: 'plbill00000draf',
        vendor: NW_PAPER,
        status: 'draft',
        number: '',
        date: '2026-11-17',
        due_date: '2026-12-17',
        memo: 'Paper restock for the print room',
        total: 48_600,
        created: '2026-11-17 08:30:00.000Z',
    }),
    bill({
        id: 'plbill000001058',
        vendor: METRO,
        status: 'posted',
        number: '1058',
        date: '2026-11-16',
        due_date: '2026-12-01',
        ref_no: 'INV-88213',
        memo: 'December rent, suite 400',
        total: 420_000,
    }),
    bill({
        id: 'plbill000001057',
        vendor: ZENITH,
        status: 'posted',
        number: '1057',
        date: '2026-11-12',
        due_date: '2026-12-12',
        ref_no: 'ZT-2026-1104',
        memo: 'Hosted phone plan and network cabling',
        total: 18_950,
        created: '2026-11-12 16:20:00.000Z',
    }),
    bill({
        id: 'plbill000001056',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '1056',
        date: '2026-11-12',
        due_date: '2026-11-27',
        ref_no: 'WV-30417',
        memo: 'Facilities booking software, annual plan',
        total: 96_000,
        balance: 36_000,
        created: '2026-11-12 10:05:00.000Z',
    }),
    bill({
        id: 'plbill000001055',
        vendor: KEYSTONE,
        status: 'posted',
        number: '1055',
        date: '2026-10-20',
        due_date: '2026-11-04',
        ref_no: 'KLG-7731',
        memo: 'Contract template library, annual plan',
        total: 1_248_000,
    }),
    bill({
        id: 'plbill000001054',
        vendor: BRIGHTWAVE,
        status: 'posted',
        number: '1054',
        date: '2026-10-14',
        due_date: '2026-11-13',
        ref_no: 'BW-0914',
        memo: 'Autumn campaign design',
        total: 86_000,
        balance: 0,
    }),
    bill({
        id: 'plbill000001053',
        vendor: NW_PAPER,
        status: 'void',
        number: '1053',
        date: '2026-10-09',
        due_date: '2026-11-08',
        ref_no: 'NP-55102',
        memo: 'Entered twice by mistake',
        total: 31_000,
    }),
    bill({
        id: 'plbill0001052fx',
        vendor: OLD_TOWN,
        status: 'posted',
        number: '1052',
        date: '2026-10-02',
        due_date: '2026-11-01',
        ref_no: 'OTP-2207',
        memo: 'Brochure paper, corrected quantity',
        total: 34_257,
    }),
    bill({
        id: 'plbill0001052ol',
        vendor: OLD_TOWN,
        status: 'void',
        number: '1052',
        date: '2026-10-02',
        due_date: '2026-11-01',
        ref_no: 'OTP-2207',
        memo: 'Brochure paper, first entry',
        total: 43_257,
        replaced_by: 'plbill0001052fx',
    }),
    bill({
        id: 'plbill000001012',
        vendor: GREENLINE,
        status: 'posted',
        number: '1012',
        date: '2026-09-15',
        due_date: '',
        total: 12_500,
    }),
    bill({
        id: 'plbill000000999',
        vendor: ZENITH,
        status: 'posted',
        number: '999',
        date: '2026-08-28',
        due_date: '2026-09-27',
        ref_no: 'ZT-2026-0811',
        memo: 'Conference line setup',
        total: 192_475,
        balance: 0,
    }),
] satisfies Partial<BooksBills>[]

// Every expense badge: Draft, Paid, Void. Two have no vendor: the Vendor cell shows "—".
export const PURCHASE_LIST_EXPENSES = [
    expense({
        id: 'plexp000000draf',
        vendor: '',
        status: 'draft',
        number: '',
        date: '2026-11-17',
        memo: 'Parking for the client visit',
        total: 2_400,
        created: '2026-11-17 12:10:00.000Z',
    }),
    expense({
        id: 'plexp0000000214',
        vendor: ZENITH,
        status: 'posted',
        number: '214',
        date: '2026-11-15',
        reference_no: 'CARD-4417',
        memo: 'Mobile hotspot plan',
        total: 8_999,
    }),
    expense({
        id: 'plexp0000000213',
        vendor: '',
        status: 'posted',
        number: '213',
        date: '2026-11-10',
        memo: 'Team lunch and desk supplies',
        total: 6_450,
    }),
    expense({
        id: 'plexp0000000212',
        vendor: NW_PAPER,
        status: 'posted',
        number: '212',
        date: '2026-11-03',
        reference_no: 'CARD-4390',
        memo: 'Two cases of printer paper',
        total: 15_800,
    }),
    expense({
        id: 'plexp0000000211',
        vendor: GREENLINE,
        status: 'void',
        number: '211',
        date: '2026-10-22',
        memo: 'Site plan drawings, charged to the wrong card',
        total: 45_000,
    }),
    expense({
        id: 'plexp0000000210',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '210',
        date: '2026-10-05',
        reference_no: 'Check 2279',
        memo: 'Laptop for the front desk',
        total: 1_250_000,
    }),
] satisfies Partial<BooksExpenses>[]

// Both bill payment badges: Paid and Void. A bill payment is never a draft.
export const PURCHASE_LIST_BILL_PAYMENTS = [
    billPayment({
        id: 'plbp00000000108',
        vendor: METRO,
        status: 'posted',
        number: '108',
        date: '2026-11-14',
        reference_no: 'ACH-20261114',
        total: 420_000,
    }),
    billPayment({
        id: 'plbp00000000107',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '107',
        date: '2026-11-13',
        reference_no: 'Check 2291',
        total: 60_000,
    }),
    billPayment({
        id: 'plbp00000000106',
        vendor: BRIGHTWAVE,
        status: 'posted',
        number: '106',
        date: '2026-11-01',
        total: 86_000,
    }),
    billPayment({
        id: 'plbp00000000105',
        vendor: KEYSTONE,
        status: 'void',
        number: '105',
        date: '2026-10-25',
        reference_no: 'Check 2288',
        total: 300_000,
    }),
    billPayment({
        id: 'plbp00000000104',
        vendor: ZENITH,
        status: 'posted',
        number: '104',
        date: '2026-09-20',
        reference_no: 'ACH-20260920',
        total: 192_475,
    }),
] satisfies Partial<BooksBillPayments>[]

// Every vendor credit badge: Draft, Unapplied, Closed, Void. A credit's total is stored
// positive; All purchases shows it negative.
export const PURCHASE_LIST_VENDOR_CREDITS = [
    vendorCredit({
        id: 'plvc0000000draf',
        vendor: NW_PAPER,
        status: 'draft',
        number: '',
        date: '2026-11-16',
        memo: 'Damaged case returned',
        total: 4_200,
        created: '2026-11-16 15:45:00.000Z',
    }),
    vendorCredit({
        id: 'plvc00000000031',
        vendor: NW_PAPER,
        status: 'posted',
        number: '31',
        date: '2026-11-11',
        ref_no: 'CM-5521',
        memo: 'Volume rebate, third quarter',
        total: 40_000,
    }),
    vendorCredit({
        id: 'plvc00000000030',
        vendor: ZENITH,
        status: 'posted',
        number: '30',
        date: '2026-10-18',
        ref_no: 'ZT-CR-0930',
        memo: 'Outage credit and returned handset',
        total: 12_000,
        balance: 0,
    }),
    vendorCredit({
        id: 'plvc00000000029',
        vendor: BRIGHTWAVE,
        status: 'void',
        number: '29',
        date: '2026-10-06',
        memo: 'Credit entered for the wrong vendor',
        total: 9_500,
    }),
    vendorCredit({
        id: 'plvc00000000028',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '28',
        date: '2026-09-30',
        ref_no: 'WV-CR-118',
        memo: 'Unused booking seats in September',
        total: 25_000,
        balance: 10_000,
    }),
] satisfies Partial<BooksVendorCredits>[]

// Every vendor refund badge: Draft, Received, Void.
export const PURCHASE_LIST_VENDOR_REFUNDS = [
    vendorRefund({
        id: 'plvr0000000draf',
        vendor: NW_PAPER,
        status: 'draft',
        number: '',
        date: '2026-11-17',
        memo: 'Refund of the rebate balance',
        amount: 15_000,
        created: '2026-11-17 09:15:00.000Z',
    }),
    vendorRefund({
        id: 'plvr00000000012',
        vendor: ZENITH,
        status: 'posted',
        number: '12',
        date: '2026-11-05',
        reference_no: 'ACH-RF-1105',
        memo: 'Deposit returned after the contract change',
        amount: 12_000,
    }),
    vendorRefund({
        id: 'plvr00000000011',
        vendor: GREENLINE,
        status: 'void',
        number: '11',
        date: '2026-10-12',
        memo: 'Refund recorded twice',
        amount: 5_000,
    }),
    vendorRefund({
        id: 'plvr00000000010',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '10',
        date: '2026-10-01',
        reference_no: 'Check 77120',
        memo: 'Refund of the booking seats credit',
        amount: 15_000,
    }),
] satisfies Partial<BooksVendorRefunds>[]

// A document line as the Category cell reads it and the seed creates it: an account line
// names an account (by seed chart number; a seed maps it to the server's id) and its
// amount, a product line a product, its quantity and its rate (its amount is their
// product, as the server writes it). Each document's lines sum to its total.
type LineOf<Line, Parent extends keyof Line> = Pick<
    Line,
    | Parent
    | Extract<
          keyof Line,
          'id' | 'kind' | 'product' | 'position' | 'description' | 'quantity' | 'rate' | 'amount'
      >
> & { account_number: string }

type LineSpec =
    | { account: string; amount: number; description: string }
    | { product: string; quantity: number; rate: number; description: string }

// A line id is 15 characters: `l`, the position, then the document id without its `pl`.
function lineFields(documentId: string, spec: LineSpec, position: number) {
    const id = `l${position}${documentId.slice(2)}`
    if ('account' in spec) {
        return {
            id,
            kind: 'account' as const,
            account_number: spec.account,
            product: '',
            position,
            description: spec.description,
            quantity: 0,
            rate: 0,
            amount: spec.amount,
        }
    }
    return {
        id,
        kind: 'item' as const,
        account_number: '',
        product: spec.product,
        position,
        description: spec.description,
        quantity: spec.quantity,
        rate: spec.rate,
        amount: spec.quantity * spec.rate,
    }
}

// The seed chart's expense accounts (lib/seed-accounts.ts), by number.
const RENT = '6100'
const SOFTWARE = '6200'
const DESIGN_TOOLS = '6210'

function accountLine(account: string, amount: number, description: string): LineSpec {
    return { account, amount, description }
}

function productLine(
    product: string,
    quantity: number,
    rate: number,
    description: string
): LineSpec {
    return { product, quantity, rate, description }
}

// The Category of each bill: one account line (an account name), one product line (a
// product name, a long one for 1012), two or more lines (Split). The void 1053 has none.
const BILL_LINE_SPECS: Record<string, LineSpec[]> = {
    plbill00000draf: [productLine(PRODUCT_IDS.paper, 6, 8_100, 'Copy paper, six cases')],
    plbill000001058: [accountLine(RENT, 420_000, 'December rent')],
    // 12 950 + 4 × 1 500 = 18 950.
    plbill000001057: [
        accountLine(SOFTWARE, 12_950, 'Hosted phone plan, November'),
        productLine(PRODUCT_IDS.patchCable, 4, 1_500, 'Patch cables for the network closet'),
    ],
    plbill000001056: [accountLine(SOFTWARE, 96_000, 'Booking software, annual plan')],
    plbill000001055: [accountLine(SOFTWARE, 1_248_000, 'Template library, annual plan')],
    plbill000001054: [accountLine(DESIGN_TOOLS, 86_000, 'Campaign design')],
    plbill0001052fx: [productLine(PRODUCT_IDS.paper, 1, 34_257, 'Brochure paper')],
    plbill000001012: [productLine(PRODUCT_IDS.laptop, 1, 12_500, 'Laptop repair parts')],
    // 100 000 + 50 000 + 42 475 = 192 475.
    plbill000000999: [
        accountLine(SOFTWARE, 100_000, 'Conference line service'),
        accountLine(DESIGN_TOOLS, 50_000, 'Slide templates'),
        accountLine(RENT, 42_475, 'Meeting room'),
    ],
}

// The draft expense has one account line, so the seeded draft's lines sum to its total.
const EXPENSE_LINE_SPECS: Record<string, LineSpec[]> = {
    plexp000000draf: [accountLine(RENT, 2_400, 'Parking for the client visit')],
    plexp0000000214: [accountLine(SOFTWARE, 8_999, 'Mobile hotspot plan')],
    // 4 450 + 4 × 500 = 6 450.
    plexp0000000213: [
        accountLine(SOFTWARE, 4_450, 'Team lunch'),
        productLine(PRODUCT_IDS.cableTies, 4, 500, 'Cable ties'),
    ],
    plexp0000000212: [productLine(PRODUCT_IDS.paper, 2, 7_900, 'Printer paper, two cases')],
    plexp0000000211: [accountLine(DESIGN_TOOLS, 45_000, 'Site plan drawings')],
    plexp0000000210: [productLine(PRODUCT_IDS.laptop, 1, 1_250_000, 'Front desk laptop')],
}

const VENDOR_CREDIT_LINE_SPECS: Record<string, LineSpec[]> = {
    plvc0000000draf: [productLine(PRODUCT_IDS.paper, 1, 4_200, 'Damaged case of paper')],
    // A purchased product: the seed posts this credit, and posting refuses a product line
    // whose product is not purchased (paper is not).
    plvc00000000031: [
        productLine(PRODUCT_IDS.accessPoint, 5, 8_000, 'Volume rebate on access points'),
    ],
    // 9 000 + 2 × 1 500 = 12 000.
    plvc00000000030: [
        accountLine(SOFTWARE, 9_000, 'Outage credit'),
        productLine(PRODUCT_IDS.patchCable, 2, 1_500, 'Returned handset cables'),
    ],
    plvc00000000029: [accountLine(DESIGN_TOOLS, 9_500, 'Design credit')],
    plvc00000000028: [accountLine(SOFTWARE, 25_000, 'Unused booking seats')],
}

export const PURCHASE_LIST_BILL_LINES = Object.entries(BILL_LINE_SPECS).flatMap(([bill, specs]) =>
    specs.map((spec, position) => ({ bill, ...lineFields(bill, spec, position) }))
) satisfies LineOf<BooksBillLines, 'bill'>[]

export const PURCHASE_LIST_EXPENSE_LINES = Object.entries(EXPENSE_LINE_SPECS).flatMap(
    ([expense, specs]) =>
        specs.map((spec, position) => ({ expense, ...lineFields(expense, spec, position) }))
) satisfies LineOf<BooksExpenseLines, 'expense'>[]

export const PURCHASE_LIST_VENDOR_CREDIT_LINES = Object.entries(VENDOR_CREDIT_LINE_SPECS).flatMap(
    ([vendor_credit, specs]) =>
        specs.map((spec, position) => ({
            vendor_credit,
            ...lineFields(vendor_credit, spec, position),
        }))
) satisfies LineOf<BooksVendorCreditLines, 'vendor_credit'>[]

// The rows the seed creates for the list specs (checkpoint 1 "Seed decision"): the four
// drafts, the bills 1057 and 1054 and the vendor credit 31, which it posts with no payment
// and no application, so as seeded 1054 reads Overdue and the credit Unapplied, whatever
// balance the rows above draw in the reference. No test may assert the badge of
// `plbill000001057`: it reads Open until its due date (2026-12-12) and Overdue after it.
// No expense, bill payment or vendor refund is posted (they move a bank account's
// register), no row is void, and no row is for Willamette, Old Town Print Shop, Keystone,
// Greenline or Metro, whose documents other fixtures and specs read.
const PURCHASE_LIST_SEED_IDS = new Set([
    'plbill00000draf',
    'plvc0000000draf',
    'plvr0000000draf',
    'plexp000000draf',
    'plbill000001057',
    'plbill000001054',
    'plvc00000000031',
])

const isSeeded = (id: string) => PURCHASE_LIST_SEED_IDS.has(id)

export const PURCHASE_LIST_SEED = {
    bills: PURCHASE_LIST_BILLS.filter(row => isSeeded(row.id)),
    expenses: PURCHASE_LIST_EXPENSES.filter(row => isSeeded(row.id)),
    vendorCredits: PURCHASE_LIST_VENDOR_CREDITS.filter(row => isSeeded(row.id)),
    vendorRefunds: PURCHASE_LIST_VENDOR_REFUNDS.filter(row => isSeeded(row.id)),
    billLines: PURCHASE_LIST_BILL_LINES.filter(line => isSeeded(line.bill)),
    expenseLines: PURCHASE_LIST_EXPENSE_LINES.filter(line => isSeeded(line.expense)),
    vendorCreditLines: PURCHASE_LIST_VENDOR_CREDIT_LINES.filter(line =>
        isSeeded(line.vendor_credit)
    ),
}

// The names the Vendor cell and the vendor picker read: every fixture vendor, inactive
// ones included (spec §3, the vendor picker).
export const PURCHASE_LIST_VENDORS = VENDORS.map(vendor => ({
    id: vendor.id,
    display_name: vendor.display_name,
    inactive: vendor.inactive,
}))

// The vendor of the reference's "filtered" states.
export const PURCHASE_LIST_FILTER_VENDOR = ZENITH

// The bill the reference shows open beside its list (the 1360 px surface).
export const PURCHASE_LIST_OPEN_BILL = 'plbill000001056'

// The rows the reference ticks for the batch states: two drafts, two posted documents and
// a void one, so "Delete drafts" applies to two and skips three, and "Void" applies to
// two and skips three.
export const PURCHASE_LIST_TICKED = [
    'plbill00000draf',
    'plvr0000000draf',
    'plbill000001058',
    'plvc00000000031',
    'plexp0000000211',
]

// The void rows alone: no batch action applies to them (the dialog with no confirm).
export const PURCHASE_LIST_TICKED_VOID = ['plbill000001053', 'plexp0000000211']

// What the server answers when it refuses a void, for the batch result banner.
export const PURCHASE_LIST_REFUSAL =
    'Bill 1058 has a payment applied to it. Void the payment first.'
