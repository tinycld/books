// Synthetic invoices for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// The invoice collections do not exist yet. The rows below are typed against local
// interfaces that mirror the spec's Data section (docs/specs/invoice-form-design.md §4.1).
// The migration checkpoint (2100000010_create_books_invoices.js) must replace
// `InvoiceRecord`, `InvoiceLineRecord` and `InvoiceTaxLineRecord` with the generated
// `BooksInvoices`, `BooksInvoiceLines` and `BooksInvoiceTaxLines` (with `satisfies`), and
// add `terms` to the customers it fills below from the generated `BooksCustomers`.
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. A percent
// line's percent is in parts per million of the line above (-10% = -100 000). `amount`,
// `subtotal`, `tax_total` and `total` are the values the server writes at every save:
// Qty x Rate and Percent x the amount above are rounded half away from zero to cents, and
// tax is `taxOn` per component of the header rate on the taxable total (lib/sales-tax.ts).
// tests must hold these numbers equal to `documentTotals` once lib/document-lines.ts exists.

import type { CustomerAddress } from './customer-form-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import type { PaymentTermKey } from './payment-terms'
import { PRODUCT_IDS, PRODUCTS, type ProductFixtureRecord } from './products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export const INVOICE_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const INVOICE_TODAY = '2026-11-04'

const STAMP = '2026-11-04 09:00:00.000Z'

export type InvoiceStatus = 'draft' | 'posted' | 'void'
export type InvoiceLineKind = 'item' | 'description' | 'subtotal' | 'percent'

// books_invoices (spec §4.1). `sort_key` is server-only and never sent; the fixture leaves
// it out, as the customer fixture leaves out `name_key` and `sort_key`.
export interface InvoiceRecord {
    id: string
    customer: string
    status: InvoiceStatus
    number: string
    sequence: number
    date: string
    due_date: string
    terms: PaymentTermKey
    bill_to: CustomerAddress | null
    email: string
    tax_rate: string
    message: string
    memo: string
    subtotal: number
    tax_total: number
    total: number
    currency: string
    entry: string
    replaces: string
    replaced_by: string
    posted_by: string
    posted_at: string
    voided_by: string
    voided_at: string
    form: string
    fields: Record<string, unknown> | null
    created: string
    updated: string
}

// books_invoice_lines (spec §4.1).
export interface InvoiceLineRecord {
    id: string
    invoice: string
    kind: InvoiceLineKind
    product: string
    description: string
    quantity: number
    rate: number
    percent_ppm: number
    amount: number
    taxable: boolean
    position: number
    created: string
    updated: string
}

// books_invoice_tax_lines (spec §4.1), written by the server at posting.
export interface InvoiceTaxLineRecord {
    id: string
    invoice: string
    rate: string
    component: string
    agency: string
    rate_ppm: number
    taxable_amount: number
    amount: number
    position: number
    created: string
    updated: string
}

// The default terms the seed gives customers (spec §4.6: two Net 30, one Due on receipt).
// The customer migration adds `terms`; until then the seed cannot write it.
export const CUSTOMER_TERMS_PATCHES = [
    { id: CUSTOMER_IDS.harborview, terms: 'net_30' },
    { id: CUSTOMER_IDS.northwind, terms: 'net_30' },
    { id: CUSTOMER_IDS.alvarez, terms: 'due_on_receipt' },
] satisfies { id: string; terms: PaymentTermKey }[]

// A percent line needs a product whose income account receives it. The product fixture
// has none, so the seed adds this Service (income 4000 Consulting Income, the seeded
// book's one income account).
export const DISCOUNT_PRODUCT_ID = 'proddiscount001'
export const INVOICE_PRODUCTS = [
    {
        id: DISCOUNT_PRODUCT_ID,
        type: 'service',
        name: 'Discount',
        sku: '',
        sales_description: 'Discount',
        price: 0,
        income_account_number: '4000',
        purchases: false,
        purchase_description: '',
        cost: 0,
        expense_account_number: '',
        taxable: false,
        inactive: false,
        currency: INVOICE_CURRENCY,
        form: '',
        fields: null,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    },
] satisfies ProductFixtureRecord[]

// The users the read view names in "Posted by" and "Voided by".
export const INVOICE_USER_IDS = { ana: 'userinvanaruiz1', omar: 'userinvomarbell' } as const
export const INVOICE_USER_NAMES: Record<string, string> = {
    [INVOICE_USER_IDS.ana]: 'Ana Ruiz',
    [INVOICE_USER_IDS.omar]: 'Omar Bell',
}

export const INVOICE_IDS = {
    // Draft with every line kind; long customer name; Denver combined.
    draft: 'invcdraftstjud1',
    // Posted 1004 with every line kind (the same lines as the draft).
    posted: 'invc1004every01',
    // Posted 1001 with no tax chosen: no tax line.
    noTax: 'invc1001notax01',
    // Void 1002, replaced by its correction (same number).
    voided: 'invc1002void001',
    correction: 'invc1002fix0001',
    // Posted 1003 of a tax-exempt customer: every line not taxable, tax $0.00.
    exempt: 'invc1003exempt1',
} as const

const IDS = INVOICE_IDS

// Aspen Ridge Dental: a customer-form fixture row with no CUSTOMER_IDS key.
const ASPEN_RIDGE = 'cust_aspen_0001'

function invoice(
    seed: Pick<InvoiceRecord, 'id' | 'customer' | 'status' | 'date' | 'due_date'> &
        Partial<InvoiceRecord>
): InvoiceRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`invoice fixture: ${seed.id} names an unknown customer`)
    return {
        number: '',
        sequence: 0,
        terms: '',
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        message: '',
        memo: '',
        subtotal: 0,
        tax_total: 0,
        total: 0,
        currency: INVOICE_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: '',
        posted_at: '',
        voided_by: '',
        voided_at: '',
        form: '',
        fields: null,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

const THANKS =
    'Thank you for your business. Please pay by bank transfer or check to Fern & Ledger Bookkeeping, and put the invoice number on the payment.'

export const INVOICES = [
    invoice({
        id: IDS.draft,
        customer: CUSTOMER_IDS.stJude,
        status: 'draft',
        date: INVOICE_TODAY,
        due_date: '2026-12-04',
        terms: 'net_30',
        tax_rate: TAX_IDS.denverCombined,
        message: THANKS,
        memo: 'Annex network refresh, October visit',
        subtotal: 206_970,
        tax_total: 4_207,
        total: 211_177,
    }),
    invoice({
        id: IDS.posted,
        customer: CUSTOMER_IDS.harborview,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-10-21',
        due_date: '2026-11-20',
        terms: 'net_30',
        tax_rate: TAX_IDS.denverCombined,
        message: THANKS,
        memo: 'October catch-up and Wi-Fi refresh',
        subtotal: 206_970,
        tax_total: 4_207,
        total: 211_177,
        entry: 'jeinvoice100401',
        posted_by: INVOICE_USER_IDS.ana,
        posted_at: '2026-10-21 21:14:00.000Z',
    }),
    invoice({
        id: IDS.noTax,
        customer: CUSTOMER_IDS.alvarez,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-10-06',
        due_date: '2026-10-06',
        terms: 'due_on_receipt',
        memo: 'Year-end return',
        subtotal: 125_000,
        total: 125_000,
        entry: 'jeinvoice100101',
        posted_by: INVOICE_USER_IDS.ana,
        posted_at: '2026-10-06 16:02:00.000Z',
    }),
    invoice({
        id: IDS.voided,
        customer: ASPEN_RIDGE,
        status: 'void',
        number: '1002',
        sequence: 1002,
        date: '2026-10-09',
        due_date: '2026-10-09',
        terms: 'due_on_receipt',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 55_200,
        tax_total: 889,
        total: 56_089,
        entry: 'jeinvoice100201',
        replaced_by: IDS.correction,
        posted_by: INVOICE_USER_IDS.ana,
        posted_at: '2026-10-09 15:40:00.000Z',
        voided_by: INVOICE_USER_IDS.omar,
        voided_at: '2026-10-12 10:05:00.000Z',
    }),
    invoice({
        id: IDS.correction,
        customer: ASPEN_RIDGE,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-10-09',
        due_date: '2026-10-09',
        terms: 'due_on_receipt',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 73_600,
        tax_total: 1_184,
        total: 74_784,
        entry: 'jeinvoice100202',
        replaces: IDS.voided,
        posted_by: INVOICE_USER_IDS.omar,
        posted_at: '2026-10-12 10:05:00.000Z',
    }),
    invoice({
        id: IDS.exempt,
        customer: CUSTOMER_IDS.northwind,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-14',
        due_date: '2026-11-13',
        terms: 'net_30',
        tax_rate: TAX_IDS.denverCombined,
        message: 'Resale certificate CO-98-01234-0000 on file.',
        subtotal: 134_400,
        total: 134_400,
        entry: 'jeinvoice100301',
        posted_by: INVOICE_USER_IDS.ana,
        posted_at: '2026-10-14 18:30:00.000Z',
    }),
] satisfies InvoiceRecord[]

type LineSeed = Pick<InvoiceLineRecord, 'kind'> & Partial<InvoiceLineRecord>

function lines(invoiceId: string, tag: string, seeds: LineSeed[]): InvoiceLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `invl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        invoice: invoiceId,
        product: '',
        description: '',
        quantity: 0,
        rate: 0,
        percent_ppm: 0,
        amount: 0,
        taxable: false,
        created: STAMP,
        updated: STAMP,
        ...seed,
        position,
    }))
}

const LONG_VISIT =
    'A technician visits, finds the fault and fixes it or leaves a written plan. Travel inside the Portland metro area is included; parts are billed separately at cost plus ten percent, and time past the first two hours is billed in fifteen-minute steps.'

// Every line kind: three items (two taxable), a subtotal, a -10% discount on it, a
// description line and an item with a long name and description. Taxable total 48 300:
// Colorado state 1 401 + RTD transit 483 + Denver city 2 323 = 4 207.
function everyKind(invoiceId: string, tag: string) {
    return lines(invoiceId, tag, [
        {
            kind: 'item',
            product: 'prodbookkeep001',
            description: 'Reconcile one month of bank and card activity and categorize every line.',
            quantity: 3,
            rate: 45_000,
            amount: 135_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E ceiling-mount access point, installed and configured.',
            quantity: 2,
            rate: 18_900,
            amount: 37_800,
            taxable: true,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 12,
            rate: 875,
            amount: 10_500,
            taxable: true,
        },
        { kind: 'subtotal', amount: 183_300 },
        {
            kind: 'percent',
            product: DISCOUNT_PRODUCT_ID,
            description: 'Returning-client discount',
            percent_ppm: -100_000,
            amount: -18_330,
        },
        {
            kind: 'description',
            description:
                'Work done at the annex office, October 6 to 17. Parts are billed at cost plus ten percent.',
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.networkVisit,
            description: LONG_VISIT,
            quantity: 1.5,
            rate: 28_000,
            amount: 42_000,
        },
    ])
}

export const INVOICE_LINES = [
    ...everyKind(IDS.draft, 'drft'),
    ...everyKind(IDS.posted, '1004'),
    ...lines(IDS.noTax, '1001', [
        {
            kind: 'item',
            product: PRODUCT_IDS.taxPrep,
            description: 'Federal and state return for a small business, with one round of review.',
            quantity: 1,
            rate: 125_000,
            amount: 125_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.consultation,
            description: 'A free first hour to scope the work.',
            quantity: 1,
            rate: 0,
            amount: 0,
        },
    ]),
    // Taxable 10 200: 296 + 102 + 491 = 889.
    ...lines(IDS.voided, '1002', [
        {
            kind: 'item',
            product: 'prodwsimaging01',
            quantity: 3,
            rate: 15_000,
            amount: 45_000,
        },
        {
            kind: 'item',
            product: 'prodsurge8out01',
            quantity: 3,
            rate: 3_400,
            amount: 10_200,
            taxable: true,
        },
    ]),
    // Taxable 13 600: 394 + 136 + 654 = 1 184.
    ...lines(IDS.correction, 'fix2', [
        {
            kind: 'item',
            product: 'prodwsimaging01',
            quantity: 4,
            rate: 15_000,
            amount: 60_000,
        },
        {
            kind: 'item',
            product: 'prodsurge8out01',
            quantity: 4,
            rate: 3_400,
            amount: 13_600,
            taxable: true,
        },
    ]),
    // A tax-exempt customer: every line starts not taxable.
    ...lines(IDS.exempt, '1003', [
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E ceiling-mount access point, for resale.',
            quantity: 6,
            rate: 18_900,
            amount: 113_400,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            quantity: 24,
            rate: 875,
            amount: 21_000,
        },
    ]),
] satisfies InvoiceLineRecord[]

const DENVER_COMPONENTS = [
    { component: TAX_IDS.state, agency: TAX_IDS.colorado, rate_ppm: 29_000 },
    { component: TAX_IDS.rtd, agency: TAX_IDS.colorado, rate_ppm: 10_000 },
    { component: TAX_IDS.denverCity, agency: TAX_IDS.denver, rate_ppm: 48_100 },
] as const

function denverTaxLines(
    invoiceId: string,
    tag: string,
    taxable: number,
    amounts: readonly [number, number, number]
): InvoiceTaxLineRecord[] {
    return DENVER_COMPONENTS.map((part, position) => ({
        id: `invt${tag}${position}`.padEnd(15, '0'),
        invoice: invoiceId,
        rate: TAX_IDS.denverCombined,
        ...part,
        taxable_amount: taxable,
        amount: amounts[position],
        position,
        created: STAMP,
        updated: STAMP,
    }))
}

// The posting snapshot of each posted or void invoice with a tax rate. 1001 has none.
export const INVOICE_TAX_LINES = [
    ...denverTaxLines(IDS.posted, '1004', 48_300, [1_401, 483, 2_323]),
    ...denverTaxLines(IDS.voided, '1002', 10_200, [296, 102, 491]),
    ...denverTaxLines(IDS.correction, 'fix2', 13_600, [394, 136, 654]),
    ...denverTaxLines(IDS.exempt, '1003', 0, [0, 0, 0]),
] satisfies InvoiceTaxLineRecord[]

// A fixture that names a missing product or tax rate is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set([...PRODUCTS, ...INVOICE_PRODUCTS].map(row => row.id))
for (const line of INVOICE_LINES) {
    if (line.product !== '' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`invoice fixture: line ${line.id} names an unknown product`)
    }
}
for (const row of INVOICES) {
    if (row.tax_rate !== '' && !TAX_RATE_ROWS.some(rate => rate.id === row.tax_rate)) {
        throw new Error(`invoice fixture: ${row.id} names an unknown tax rate`)
    }
}

// What the reference shows for the read view's stamps and the server's refusals.
export const INVOICE_REFUSALS = {
    closeDate:
        'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-12.',
    inactiveProduct:
        'Line 2: Wireless access point is inactive. Choose an active product or service.',
    inactiveCustomer: 'Old Mill Bakery is inactive. Choose an active customer.',
} as const

export const NO_INVOICES: InvoiceRecord[] = []
