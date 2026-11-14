// Synthetic data for the customer page (spec docs/specs/customer-pages-design.md): the
// helix reference route reads it directly, and the checkpoint that creates
// books_party_contacts wires CUSTOMER_PAGE_CONTACTS into seed.ts. Customers come from
// customer-form-fixture.ts (fixture ids; the seed maps them to the server's ids).
//
// The sales documents are typed with `satisfies` against the generated row types, so
// tsc checks every column the page reads. The two collections this unit adds do not
// exist yet: PartyBalanceRecord and PartyContactRecord mirror spec §4 and must be
// replaced by the generated `BooksPartyBalances` / `BooksPartyContacts` (from
// `../types`) in the checkpoint that adds their migrations.

import type { BooksEstimates, BooksInvoices, BooksSalesReceipts } from '../types'
import { CUSTOMER_IDS } from './customer-form-fixture'

// The day the reference is drawn on: Overdue and Expired are computed against it.
export const CUSTOMER_PAGE_TODAY = '2026-11-13'

const STAMP = '2026-11-01 09:00:00.000Z'

// Replace with the generated BooksPartyBalances (spec §4: a view, row id = customer id,
// balance in integer cents, debits minus credits, so a credit is negative).
export interface PartyBalanceRecord {
    id: string
    customer: string
    balance: number
}

// Replace with the generated BooksPartyContacts (spec §4: exactly one of customer and
// vendor is set).
export interface PartyContactRecord {
    id: string
    customer: string
    vendor: string
    name: string
    role: string
    email: string
    phone: string
    is_primary: boolean
    created: string
    updated: string
}

type InvoiceRow = Pick<
    BooksInvoices,
    | 'id'
    | 'customer'
    | 'status'
    | 'number'
    | 'date'
    | 'due_date'
    | 'total'
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
    | 'date'
    | 'expiration_date'
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
    | 'date'
    | 'total'
    | 'currency'
    | 'replaced_by'
    | 'created'
>

function invoice(
    seed: Pick<
        InvoiceRow,
        'id' | 'customer' | 'status' | 'number' | 'date' | 'due_date' | 'total'
    > &
        Partial<InvoiceRow>
): InvoiceRow {
    return { currency: 'USD', replaced_by: '', created: STAMP, ...seed }
}

function estimate(
    seed: Pick<
        EstimateRow,
        'id' | 'customer' | 'status' | 'number' | 'date' | 'expiration_date' | 'total'
    > &
        Partial<EstimateRow>
): EstimateRow {
    return { currency: 'USD', created: STAMP, ...seed }
}

function receipt(
    seed: Pick<SalesReceiptRow, 'id' | 'customer' | 'status' | 'number' | 'date' | 'total'> &
        Partial<SalesReceiptRow>
): SalesReceiptRow {
    return { currency: 'USD', replaced_by: '', created: STAMP, ...seed }
}

const HARBOR = CUSTOMER_IDS.harborview
const ST_JUDE = CUSTOMER_IDS.stJude
const ALVAREZ = CUSTOMER_IDS.alvarez

// Harborview: every invoice status and both void cases. INV-1038 was corrected: the
// void original (replaced_by set) is left out of the list, its correction shows.
// Posted, due before CUSTOMER_PAGE_TODAY (overdue): INV-1035, INV-1031, INV-1019.
// Two rows share 2026-11-03 so the `created` tie-break shows.
export const CUSTOMER_PAGE_INVOICES = [
    invoice({
        id: 'cpinv0000001042',
        customer: HARBOR,
        status: 'draft',
        number: 'INV-1042',
        date: '2026-11-12',
        due_date: '2026-12-12',
        total: 486_000,
    }),
    invoice({
        id: 'cpinv0000001041',
        customer: HARBOR,
        status: 'posted',
        number: 'INV-1041',
        date: '2026-11-03',
        due_date: '2026-12-03',
        total: 1_250_000,
        created: '2026-11-03 10:15:00.000Z',
    }),
    invoice({
        id: 'cpinv0001038fix',
        customer: HARBOR,
        status: 'posted',
        number: 'INV-1038',
        date: '2026-10-20',
        due_date: '2026-11-19',
        total: 342_575,
    }),
    invoice({
        id: 'cpinv0001038old',
        customer: HARBOR,
        status: 'void',
        number: 'INV-1038',
        date: '2026-10-20',
        due_date: '2026-11-19',
        total: 324_575,
        replaced_by: 'cpinv0001038fix',
    }),
    invoice({
        id: 'cpinv0000001035',
        customer: HARBOR,
        status: 'posted',
        number: 'INV-1035',
        date: '2026-09-28',
        due_date: '2026-10-28',
        total: 918_040,
    }),
    invoice({
        id: 'cpinv0000001031',
        customer: HARBOR,
        status: 'posted',
        number: 'INV-1031',
        date: '2026-09-02',
        due_date: '2026-10-02',
        total: 215_000,
    }),
    invoice({
        id: 'cpinv0000001027',
        customer: HARBOR,
        status: 'void',
        number: 'INV-1027',
        date: '2026-08-14',
        due_date: '2026-09-13',
        total: 77_500,
    }),
    invoice({
        id: 'cpinv0000001019',
        customer: HARBOR,
        status: 'posted',
        number: 'INV-1019',
        date: '2026-06-30',
        due_date: '2026-07-30',
        total: 56_250,
    }),
    // St. Jude: one large open invoice, for the long-name header.
    invoice({
        id: 'cpinv0000001040',
        customer: ST_JUDE,
        status: 'posted',
        number: 'INV-1040',
        date: '2026-10-30',
        due_date: '2026-11-29',
        total: 12_480_000,
    }),
] satisfies Partial<BooksInvoices>[]

// Harborview: every estimate status, and a Pending one past its expiration (Expired).
export const CUSTOMER_PAGE_ESTIMATES = [
    estimate({
        id: 'cpest0000000218',
        customer: HARBOR,
        status: 'pending',
        number: 'EST-0218',
        date: '2026-11-10',
        expiration_date: '2026-12-10',
        total: 2_240_000,
    }),
    estimate({
        id: 'cpest0000000211',
        customer: HARBOR,
        status: 'accepted',
        number: 'EST-0211',
        date: '2026-11-03',
        expiration_date: '2026-12-03',
        total: 1_250_000,
        created: '2026-11-03 09:40:00.000Z',
    }),
    estimate({
        id: 'cpest0000000205',
        customer: HARBOR,
        status: 'pending',
        number: 'EST-0205',
        date: '2026-09-15',
        expiration_date: '2026-10-15',
        total: 640_000,
    }),
    estimate({
        id: 'cpest0000000199',
        customer: HARBOR,
        status: 'rejected',
        number: 'EST-0199',
        date: '2026-08-22',
        expiration_date: '2026-09-21',
        total: 315_000,
    }),
    estimate({
        id: 'cpest0000000190',
        customer: HARBOR,
        status: 'closed',
        number: 'EST-0190',
        date: '2026-07-15',
        expiration_date: '2026-08-14',
        total: 98_000,
    }),
] satisfies Partial<BooksEstimates>[]

// Harborview: Draft, Paid (posted) and Void. Alvarez: one paid receipt and no estimates,
// for the "No estimates for this customer" filter state.
export const CUSTOMER_PAGE_SALES_RECEIPTS = [
    receipt({
        id: 'cpsr00000000077',
        customer: HARBOR,
        status: 'posted',
        number: 'SR-0077',
        date: '2026-11-07',
        total: 45_900,
    }),
    receipt({
        id: 'cpsr00000000071',
        customer: HARBOR,
        status: 'draft',
        number: 'SR-0071',
        date: '2026-10-30',
        total: 12_500,
    }),
    receipt({
        id: 'cpsr00000000064',
        customer: HARBOR,
        status: 'void',
        number: 'SR-0064',
        date: '2026-09-15',
        total: 30_000,
    }),
    receipt({
        id: 'cpsr00000000069',
        customer: ALVAREZ,
        status: 'posted',
        number: 'SR-0069',
        date: '2026-10-11',
        total: 184_250,
    }),
] satisfies Partial<BooksSalesReceipts>[]

// Open = the sum of the customer's posted invoices here (no other A/R lines):
// Harborview 1,250,000 + 342,575 + 918,040 + 215,000 + 56,250 = 2,781,865 cents, of which
// 1,189,290 is overdue. Alvarez has a credit (a negative balance). Northwind has no row,
// so its Open is $0.00.
export const CUSTOMER_PAGE_BALANCES: PartyBalanceRecord[] = [
    { id: HARBOR, customer: HARBOR, balance: 2_781_865 },
    { id: ST_JUDE, customer: ST_JUDE, balance: 12_480_000 },
    { id: ALVAREZ, customer: ALVAREZ, balance: -12_000 },
]

function contact(
    seed: Pick<PartyContactRecord, 'id' | 'customer' | 'name'> & Partial<PartyContactRecord>
): PartyContactRecord {
    return {
        vendor: '',
        role: '',
        email: '',
        phone: '',
        is_primary: false,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

// Contacts for three seeded customers. Harborview has a primary, a long role and a long
// email; Northwind has a primary only; Alvarez has one contact with a phone and no email.
// Stored unordered: the page sorts primary first, then by name.
export const CUSTOMER_PAGE_CONTACTS: PartyContactRecord[] = [
    contact({
        id: 'cpcontact000002',
        customer: HARBOR,
        name: 'Rafael Mendoza-Okafor',
        role: 'Director of Food and Beverage Operations, Waterfront Properties',
        email: 'rafael.mendoza-okafor@harborviewhospitality.com',
        phone: '(206) 555-0168',
    }),
    contact({
        id: 'cpcontact000001',
        customer: HARBOR,
        name: 'Dana Whitfield',
        role: 'Controller',
        email: 'dana.whitfield@harborviewhospitality.com',
        phone: '(206) 555-0142',
        is_primary: true,
    }),
    contact({
        id: 'cpcontact000003',
        customer: HARBOR,
        name: 'Kim Tran',
        role: 'Accounts payable',
        email: 'accounts.payable@harborviewhospitality.com',
    }),
    contact({
        id: 'cpcontact000004',
        customer: CUSTOMER_IDS.northwind,
        name: 'Priya Raman',
        role: 'Accounts payable manager',
        email: 'priya.raman@northwindtraders.example',
        phone: '(503) 555-0110',
        is_primary: true,
    }),
    contact({
        id: 'cpcontact000005',
        customer: ALVAREZ,
        name: 'Tomás Alvarez',
        role: 'Site contact',
        phone: '(415) 555-0187',
    }),
]

// The notes of the Notes tab's dirty state: an edit of Harborview's stored notes.
export const CUSTOMER_PAGE_EDITED_NOTES =
    'Net 30. Send invoices to the AP inbox, not to Dana directly.\n\nFrom January: the kitchen and events sub-customers get their own invoices; do not combine them on one invoice.'
