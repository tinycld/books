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
// The seed wiring (spec §4 "Seed") is the work of the checkpoint that builds the lists'
// data: it picks the draft and posted rows the list specs delete, void and filter. The
// vendors here have no document in another fixture's totals, except the two that show an
// edge (the long name, the inactive vendor): the seed must not post a document for those.

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

// A document line as the Category cell reads it: an account line names an account (by
// seed chart number; a seed maps it to the server's id), a product line a product.
type LineOf<Line, Parent extends keyof Line> = Pick<
    Line,
    Parent | Extract<keyof Line, 'id' | 'kind' | 'product' | 'position'>
> & { account_number: string }

type LineSpec = { account: string } | { product: string }

// A line id is 15 characters: `l`, the position, then the document id without its `pl`.
function lineFields(documentId: string, spec: LineSpec, position: number) {
    const id = `l${position}${documentId.slice(2)}`
    if ('account' in spec) {
        return { id, kind: 'account' as const, account_number: spec.account, product: '', position }
    }
    return { id, kind: 'item' as const, account_number: '', product: spec.product, position }
}

// The seed chart's expense accounts (lib/seed-accounts.ts), by number.
const RENT = '6100'
const SOFTWARE = '6200'
const DESIGN_TOOLS = '6210'

// The Category of each bill: one account line (an account name), one product line (a
// product name, a long one for 1012), two or more lines (Split). The void 1053 has none.
const BILL_LINE_SPECS: Record<string, LineSpec[]> = {
    plbill00000draf: [{ product: PRODUCT_IDS.paper }],
    plbill000001058: [{ account: RENT }],
    plbill000001057: [{ account: SOFTWARE }, { product: PRODUCT_IDS.patchCable }],
    plbill000001056: [{ account: SOFTWARE }],
    plbill000001055: [{ account: SOFTWARE }],
    plbill000001054: [{ account: DESIGN_TOOLS }],
    plbill0001052fx: [{ product: PRODUCT_IDS.paper }],
    plbill000001012: [{ product: PRODUCT_IDS.laptop }],
    plbill000000999: [{ account: SOFTWARE }, { account: DESIGN_TOOLS }, { account: RENT }],
}

// The draft expense has no line yet: its Category is "—".
const EXPENSE_LINE_SPECS: Record<string, LineSpec[]> = {
    plexp0000000214: [{ account: SOFTWARE }],
    plexp0000000213: [{ account: SOFTWARE }, { product: PRODUCT_IDS.cableTies }],
    plexp0000000212: [{ product: PRODUCT_IDS.paper }],
    plexp0000000211: [{ account: DESIGN_TOOLS }],
    plexp0000000210: [{ product: PRODUCT_IDS.laptop }],
}

const VENDOR_CREDIT_LINE_SPECS: Record<string, LineSpec[]> = {
    plvc0000000draf: [{ product: PRODUCT_IDS.paper }],
    plvc00000000031: [{ product: PRODUCT_IDS.paper }],
    plvc00000000030: [{ account: SOFTWARE }, { product: PRODUCT_IDS.patchCable }],
    plvc00000000029: [{ account: DESIGN_TOOLS }],
    plvc00000000028: [{ account: SOFTWARE }],
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
