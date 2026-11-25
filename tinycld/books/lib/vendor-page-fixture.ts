// Synthetic data for the vendor page (the vendor pages design spec): the helix
// reference route reads it directly, and seed.ts creates VENDOR_PAGE_CONTACTS. Vendors
// come from vendor-form-fixture.ts (fixture ids; the seed keeps them).
//
// Every document row is typed with `satisfies` against the generated row types, so tsc
// checks every column the page reads. The documents are for the reference only: the seed
// has its own bills, payments, credits and refunds.

import type {
    BooksBillPayments,
    BooksBills,
    BooksExpenses,
    BooksPartyBalances,
    BooksPartyContacts,
    BooksVendorCredits,
    BooksVendorRefunds,
} from '../types'
import { VENDOR_IDS } from './vendor-form-fixture'

// The day the reference is drawn on: Overdue is computed against it.
export const VENDOR_PAGE_TODAY = '2026-11-18'

const STAMP = '2026-11-01 09:00:00.000Z'

// A row of the `books_party_balances` view (2100000026_add_vendor_party_balances.js):
// row id = party id, exactly one of customer and vendor set, balance in integer cents
// with "owed" positive (a vendor row is credits minus debits, so a credit with the vendor
// is negative).
export type VendorPartyBalanceRecord = BooksPartyBalances

type BillRow = Pick<
    BooksBills,
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'date'
    | 'due_date'
    | 'total'
    | 'balance'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type ExpenseRow = Pick<
    BooksExpenses,
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'date'
    | 'total'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type BillPaymentRow = Pick<
    BooksBillPayments,
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'date'
    | 'total'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type VendorCreditRow = Pick<
    BooksVendorCredits,
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'date'
    | 'total'
    | 'balance'
    | 'currency'
    | 'replaced_by'
    | 'created'
>
type VendorRefundRow = Pick<
    BooksVendorRefunds,
    | 'id'
    | 'vendor'
    | 'status'
    | 'number'
    | 'date'
    | 'amount'
    | 'currency'
    | 'replaced_by'
    | 'created'
>

const DEFAULTS = { currency: 'USD', replaced_by: '', created: STAMP }

function bill(
    seed: Pick<BillRow, 'id' | 'vendor' | 'status' | 'number' | 'date' | 'due_date' | 'total'> &
        Partial<BillRow>
): BillRow {
    // What posting writes: a posted bill is open for its total until a payment or a
    // credit lowers it. A draft or a void one has no balance.
    return { ...DEFAULTS, balance: seed.status === 'posted' ? seed.total : 0, ...seed }
}

function expense(
    seed: Pick<ExpenseRow, 'id' | 'vendor' | 'status' | 'number' | 'date' | 'total'> &
        Partial<ExpenseRow>
): ExpenseRow {
    return { ...DEFAULTS, ...seed }
}

function billPayment(
    seed: Pick<BillPaymentRow, 'id' | 'vendor' | 'status' | 'number' | 'date' | 'total'> &
        Partial<BillPaymentRow>
): BillPaymentRow {
    return { ...DEFAULTS, ...seed }
}

function vendorCredit(
    seed: Pick<VendorCreditRow, 'id' | 'vendor' | 'status' | 'number' | 'date' | 'total'> &
        Partial<VendorCreditRow>
): VendorCreditRow {
    return { ...DEFAULTS, balance: seed.status === 'posted' ? seed.total : 0, ...seed }
}

function vendorRefund(
    seed: Pick<VendorRefundRow, 'id' | 'vendor' | 'status' | 'number' | 'date' | 'amount'> &
        Partial<VendorRefundRow>
): VendorRefundRow {
    return { ...DEFAULTS, ...seed }
}

const OFFICE = VENDOR_IDS.officeSupply
const WILLAMETTE = VENDOR_IDS.willamette
const OKAFOR = VENDOR_IDS.okafor
const PACIFIC = VENDOR_IDS.pacificPower

// Office Supply World: every bill status and both void cases. Bill 1038 was corrected:
// the void original (replaced_by set) is left out of the list, its correction shows.
// Posted, due before VENDOR_PAGE_TODAY with an open balance (overdue): 1035 and 1019.
// 1031 is partly paid and past due: Partly paid wins over Overdue in the badge, and its
// open part still counts in the Overdue figure. 1024 is paid (balance 0).
// Two rows share 2026-11-03 (a bill and an expense) so the `created` tie-break shows.
export const VENDOR_PAGE_BILLS = [
    bill({
        id: 'vpbill000001042',
        vendor: OFFICE,
        status: 'draft',
        number: '1042',
        date: '2026-11-16',
        due_date: '2026-12-01',
        total: 48_600,
    }),
    bill({
        id: 'vpbill000001041',
        vendor: OFFICE,
        status: 'posted',
        number: '1041',
        date: '2026-11-03',
        due_date: '2026-11-18',
        total: 125_000,
        created: '2026-11-03 10:15:00.000Z',
    }),
    bill({
        id: 'vpbill0001038fx',
        vendor: OFFICE,
        status: 'posted',
        number: '1038',
        date: '2026-10-27',
        due_date: '2026-11-26',
        total: 34_257,
    }),
    bill({
        id: 'vpbill0001038ol',
        vendor: OFFICE,
        status: 'void',
        number: '1038',
        date: '2026-10-27',
        due_date: '2026-11-26',
        total: 32_457,
        replaced_by: 'vpbill0001038fx',
    }),
    bill({
        id: 'vpbill000001035',
        vendor: OFFICE,
        status: 'posted',
        number: '1035',
        date: '2026-10-14',
        due_date: '2026-10-29',
        total: 91_804,
    }),
    bill({
        id: 'vpbill000001031',
        vendor: OFFICE,
        status: 'posted',
        number: '1031',
        date: '2026-09-22',
        due_date: '2026-10-07',
        total: 60_000,
        balance: 21_500,
    }),
    bill({
        id: 'vpbill000001027',
        vendor: OFFICE,
        status: 'void',
        number: '1027',
        date: '2026-08-14',
        due_date: '2026-08-29',
        total: 7_750,
    }),
    bill({
        id: 'vpbill000001024',
        vendor: OFFICE,
        status: 'posted',
        number: '1024',
        date: '2026-07-20',
        due_date: '2026-08-04',
        total: 42_000,
        balance: 0,
    }),
    bill({
        id: 'vpbill000001019',
        vendor: OFFICE,
        status: 'posted',
        number: '1019',
        date: '2026-06-30',
        due_date: '2026-07-15',
        total: 5_625,
    }),
    // Willamette: one large open bill, for the long-name header and a wide figure.
    bill({
        id: 'vpbill000001040',
        vendor: WILLAMETTE,
        status: 'posted',
        number: '1040',
        date: '2026-11-02',
        due_date: '2027-01-01',
        total: 1_248_000_00,
    }),
    // Pacific Power: one open bill and nothing of any other kind, for the
    // "No expenses for this vendor" filter state.
    bill({
        id: 'vpbill000001039',
        vendor: PACIFIC,
        status: 'posted',
        number: '1039',
        date: '2026-11-05',
        due_date: '2026-11-05',
        total: 18_425,
    }),
] satisfies Partial<BooksBills>[]

// Office Supply World: Draft, Paid (posted) and Void.
export const VENDOR_PAGE_EXPENSES = [
    expense({
        id: 'vpexp0000000311',
        vendor: OFFICE,
        status: 'posted',
        number: '311',
        date: '2026-11-10',
        total: 4_590,
    }),
    expense({
        id: 'vpexp0000000309',
        vendor: OFFICE,
        status: 'draft',
        number: '',
        date: '2026-11-03',
        total: 1_250,
        created: '2026-11-03 09:40:00.000Z',
    }),
    expense({
        id: 'vpexp0000000298',
        vendor: OFFICE,
        status: 'void',
        number: '298',
        date: '2026-09-15',
        total: 3_000,
    }),
] satisfies Partial<BooksExpenses>[]

// Office Supply World: the payments behind 1024 (paid) and 1031 (partly paid), and a void.
export const VENDOR_PAGE_BILL_PAYMENTS = [
    billPayment({
        id: 'vpbpay000000207',
        vendor: OFFICE,
        status: 'posted',
        number: '207',
        date: '2026-10-09',
        total: 38_500,
    }),
    billPayment({
        id: 'vpbpay000000198',
        vendor: OFFICE,
        status: 'void',
        number: '198',
        date: '2026-08-21',
        total: 7_750,
    }),
    billPayment({
        id: 'vpbpay000000191',
        vendor: OFFICE,
        status: 'posted',
        number: '191',
        date: '2026-08-03',
        total: 42_000,
    }),
] satisfies Partial<BooksBillPayments>[]

// Office Supply World: Draft, Unapplied (balance above 0), Closed (balance 0) and Void.
// Jamal Okafor: one unapplied credit and no bill, so his Open figure is a credit.
export const VENDOR_PAGE_VENDOR_CREDITS = [
    vendorCredit({
        id: 'vpvcred00000058',
        vendor: OFFICE,
        status: 'draft',
        number: '',
        date: '2026-11-12',
        total: 2_400,
    }),
    vendorCredit({
        id: 'vpvcred00000057',
        vendor: OFFICE,
        status: 'posted',
        number: '57',
        date: '2026-10-30',
        total: 9_900,
    }),
    vendorCredit({
        id: 'vpvcred00000052',
        vendor: OFFICE,
        status: 'posted',
        number: '52',
        date: '2026-09-04',
        total: 15_000,
        balance: 0,
    }),
    vendorCredit({
        id: 'vpvcred00000049',
        vendor: OFFICE,
        status: 'void',
        number: '49',
        date: '2026-07-11',
        total: 6_000,
    }),
    vendorCredit({
        id: 'vpvcred00000055',
        vendor: OKAFOR,
        status: 'posted',
        number: '55',
        date: '2026-10-02',
        total: 12_000,
    }),
] satisfies Partial<BooksVendorCredits>[]

// Office Supply World: Received (posted), Draft and Void. The posted refund closed credit 52.
export const VENDOR_PAGE_VENDOR_REFUNDS = [
    vendorRefund({
        id: 'vpvref000000014',
        vendor: OFFICE,
        status: 'draft',
        number: '',
        date: '2026-11-14',
        amount: 9_900,
    }),
    vendorRefund({
        id: 'vpvref000000012',
        vendor: OFFICE,
        status: 'posted',
        number: '12',
        date: '2026-09-18',
        amount: 15_000,
    }),
    vendorRefund({
        id: 'vpvref000000009',
        vendor: OFFICE,
        status: 'void',
        number: '9',
        date: '2026-07-25',
        amount: 6_000,
    }),
] satisfies Partial<BooksVendorRefunds>[]

// Open = the vendor's posted open bills less its unapplied credits (no other A/P lines):
// Office Supply World 125,000 + 34,257 + 91,804 + 21,500 + 5,625 − 9,900 = 268,286 cents,
// of which 91,804 + 21,500 + 5,625 = 118,929 is overdue. Pacific Power's bill is due
// before today, so all of it is overdue. Jamal Okafor has a credit (a negative balance).
// Coastal Coffee Roasters has no row, so its Open is $0.00.
export const VENDOR_PAGE_BALANCES = [
    { id: OFFICE, customer: '', vendor: OFFICE, balance: 268_286 },
    { id: WILLAMETTE, customer: '', vendor: WILLAMETTE, balance: 1_248_000_00 },
    { id: PACIFIC, customer: '', vendor: PACIFIC, balance: 18_425 },
    { id: OKAFOR, customer: '', vendor: OKAFOR, balance: -12_000 },
] satisfies BooksPartyBalances[]

function contact(
    seed: Pick<BooksPartyContacts, 'id' | 'vendor' | 'name'> & Partial<BooksPartyContacts>
): BooksPartyContacts {
    return {
        customer: '',
        role: '',
        email: '',
        phone: '',
        is_primary: false,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

// Contacts for three seeded vendors. Office Supply World has a primary, a long role and a
// long email, and one contact with no phone; Willamette has a primary only; Jamal Okafor
// has one contact with a phone and no email. Stored unordered: the page sorts primary
// first, then by name.
export const VENDOR_PAGE_CONTACTS = [
    contact({
        id: 'vpcontact000002',
        vendor: OFFICE,
        name: 'Marguerite Delacroix-Benson',
        role: 'Regional Manager, Commercial and Government Accounts, Southern California',
        email: 'marguerite.delacroix-benson@officesupplyworld.example',
        phone: '(323) 555-0191',
    }),
    contact({
        id: 'vpcontact000001',
        vendor: OFFICE,
        name: 'Grace Liu',
        role: 'Account representative',
        email: 'grace.liu@officesupplyworld.example',
        phone: '(323) 555-0142',
        is_primary: true,
    }),
    contact({
        id: 'vpcontact000003',
        vendor: OFFICE,
        name: 'Accounts receivable',
        role: 'Billing questions',
        email: 'ar@officesupplyworld.example',
    }),
    contact({
        id: 'vpcontact000004',
        vendor: WILLAMETTE,
        name: 'Bartholomew Vandersloot-Okonkwo',
        role: 'Commercial accounts manager',
        email: 'b.vandersloot-okonkwo@willamettevalleycommercialcleaning.example',
        phone: '(503) 555-0131',
        is_primary: true,
    }),
    contact({
        id: 'vpcontact000005',
        vendor: OKAFOR,
        name: 'Ada Okafor',
        role: 'Studio manager',
        phone: '(971) 555-0167',
    }),
] satisfies BooksPartyContacts[]

// The notes of the Notes tab's dirty state: an edit of Office Supply World's stored notes.
export const VENDOR_PAGE_EDITED_NOTES =
    'Order by noon for next-day delivery. Ask for Grace about bulk paper pricing.\n\nFrom January: toner goes on a separate bill, coded to Printing. Do not pay a bill that has no purchase order number on it.'
