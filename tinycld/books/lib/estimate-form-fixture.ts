// Synthetic estimates for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents), as in invoice-form-fixture.ts: `amount`,
// `subtotal`, `tax_total` and `total` are the values the server writes at every save
// (Qty x Rate and Percent x the amount above rounded half away from zero to cents, tax
// `taxOn` per component of the header rate on the taxable total). An estimate never
// posts, so it has no tax snapshot: tax_total is the live tax of its lines (spec §4).
//
// EstimateRecord, EstimateLineRecord and ConvertedInvoiceRecord are the generated
// types of books_estimates, books_estimate_lines and books_invoices (2100000012 adds
// books_invoices.estimate), and every row array `satisfies` them, so a row that drifts
// from the schema fails tsc.

import type { BooksEstimateLines, BooksEstimates, BooksInvoiceLines, BooksInvoices } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { DISCOUNT_PRODUCT_ID, INVOICE_PRODUCTS } from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export const ESTIMATE_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates and Expired are stable.
export const ESTIMATE_TODAY = '2026-11-12'

const STAMP = '2026-11-12 09:00:00.000Z'

// Spec §3.3: the writer picks Pending, Accepted or Rejected; only the server sets Closed.
export type EstimateStatus = BooksEstimates['status']

export type EstimateRecord = BooksEstimates

export type EstimateLineRecord = BooksEstimateLines

// An invoice made from an estimate names it in `estimate`.
export type ConvertedInvoiceRecord = BooksInvoices

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    closed: 'Closed',
}

export const ESTIMATE_IDS = {
    // Pending 1001, expires after today, every line kind, Denver combined.
    pending: 'estm1001harbor1',
    // Pending 1002, expired on 2026-10-31: the Expired badge. A tax-exempt customer.
    expired: 'estm1002nwind01',
    // Accepted 1003 with Accepted by and Accepted date; no tax chosen.
    accepted: 'estm1003alvarez',
    // Rejected 1004: no Convert to invoice.
    rejected: 'estm1004aspen01',
    // Closed 1005, converted to the draft invoice CONVERTED_INVOICE_ID; long customer name.
    closed: 'estm1005stjude1',
} as const

const IDS = ESTIMATE_IDS

// The draft invoice estimate 1005 was converted to (spec §4 seed: a draft, so no ledger
// spec moves).
export const CONVERTED_INVOICE_ID = 'invcfromest1005'

// Aspen Ridge Dental: a customer-form fixture row with no CUSTOMER_IDS key.
const ASPEN_RIDGE = 'cust_aspen_0001'

type EstimateSeed = Pick<EstimateRecord, 'id' | 'customer' | 'status' | 'date'> &
    Partial<EstimateRecord>

function estimate(seed: EstimateSeed): EstimateRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`estimate fixture: ${seed.id} names an unknown customer`)
    return {
        number: '',
        sequence: 0,
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        expiration_date: '',
        accepted_by: '',
        accepted_date: '',
        message: '',
        memo: '',
        subtotal: 0,
        tax_total: 0,
        total: 0,
        currency: ESTIMATE_CURRENCY,
        invoice: '',
        form: '',
        fields: null,
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

// The text of the Books setting "Default message to customer" in the reference.
export const DEFAULT_ESTIMATE_MESSAGE =
    'Thank you for the chance to quote this work. Prices hold until the expiration date.'

// At most 200 characters (spec §3.3), long enough to wrap in the band.
export const LONG_ACCEPTED_BY = 'Marisol Alvarez-Whitfield, owner, by phone with the site lead'

export const ESTIMATES = [
    estimate({
        id: IDS.pending,
        customer: CUSTOMER_IDS.harborview,
        status: 'pending',
        number: '1001',
        sequence: 1001,
        date: '2026-11-02',
        expiration_date: '2027-01-15',
        tax_rate: TAX_IDS.denverCombined,
        message: DEFAULT_ESTIMATE_MESSAGE,
        memo: 'Annex network refresh, quoted after the October walk-through',
        subtotal: 206_970,
        tax_total: 4_207,
        total: 211_177,
    }),
    estimate({
        id: IDS.expired,
        customer: CUSTOMER_IDS.northwind,
        status: 'pending',
        number: '1002',
        sequence: 1002,
        date: '2026-10-01',
        expiration_date: '2026-10-31',
        tax_rate: TAX_IDS.denverCombined,
        message: 'Resale certificate CO-98-01234-0000 on file.',
        subtotal: 134_400,
        total: 134_400,
    }),
    estimate({
        id: IDS.accepted,
        customer: CUSTOMER_IDS.alvarez,
        status: 'accepted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-20',
        expiration_date: '2026-12-20',
        accepted_by: LONG_ACCEPTED_BY,
        accepted_date: '2026-10-24',
        message: DEFAULT_ESTIMATE_MESSAGE,
        memo: 'Year-end return; she asked for one review round',
        subtotal: 125_000,
        total: 125_000,
    }),
    estimate({
        id: IDS.rejected,
        customer: ASPEN_RIDGE,
        status: 'rejected',
        number: '1004',
        sequence: 1004,
        date: '2026-10-09',
        tax_rate: TAX_IDS.denverCombined,
        memo: 'Went with their hardware vendor',
        subtotal: 55_200,
        tax_total: 889,
        total: 56_089,
    }),
    // Seeded as Accepted; the converted invoice's first save closes it (spec §3.7). The
    // acceptance fields stay on a closed estimate, so undoing the conversion can reopen
    // it as Accepted.
    estimate({
        id: IDS.closed,
        customer: CUSTOMER_IDS.stJude,
        status: 'closed',
        number: '1005',
        sequence: 1005,
        date: '2026-10-28',
        expiration_date: '2026-11-27',
        accepted_by: 'Dr. Helen Okafor',
        accepted_date: '2026-11-03',
        tax_rate: TAX_IDS.denverCombined,
        message: DEFAULT_ESTIMATE_MESSAGE,
        memo: 'Gala network setup; foundation board approved',
        subtotal: 181_700,
        tax_total: 4_938,
        total: 186_638,
        invoice: CONVERTED_INVOICE_ID,
    }),
] satisfies EstimateRecord[]

// The order the estimates are numbered in, 1001 to 1005. The seed (seedEstimates)
// creates the four that are not closed, so the server numbers them 1001 to 1004; the
// closed one is closed only by the first save of an invoice made from it.
export const ESTIMATE_SEED_IDS = [
    IDS.pending,
    IDS.expired,
    IDS.accepted,
    IDS.rejected,
    IDS.closed,
] as const

type LineSeed = Pick<EstimateLineRecord, 'kind'> & Partial<EstimateLineRecord>

function lines(estimateId: string, tag: string, seeds: LineSeed[]): EstimateLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `estl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        estimate: estimateId,
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

// 1005's lines; the converted invoice carries the same lines in the same order.
const GALA_LINES: LineSeed[] = [
    {
        kind: 'item',
        product: PRODUCT_IDS.accessPoint,
        description: 'Wi-Fi 6E ceiling-mount access point for the gala tent.',
        quantity: 3,
        rate: 18_900,
        amount: 56_700,
        taxable: true,
    },
    {
        kind: 'item',
        product: PRODUCT_IDS.taxPrep,
        description: 'Event-night bookkeeping and the donor receipt run.',
        quantity: 1,
        rate: 125_000,
        amount: 125_000,
    },
]

export const ESTIMATE_LINES = [
    // Every line kind: three items (two taxable), a subtotal, a -10% discount on it, a
    // description line and an item with a long name and description. Taxable 48 300:
    // Colorado state 1 401 + RTD transit 483 + Denver city 2 323 = 4 207.
    ...lines(IDS.pending, '1001', [
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
                'Work at the annex office over two weeks from the start date. Parts are billed at cost plus ten percent.',
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.networkVisit,
            description: LONG_VISIT,
            quantity: 1.5,
            rate: 28_000,
            amount: 42_000,
        },
    ]),
    // A tax-exempt customer: every line not taxable, tax $0.00.
    ...lines(IDS.expired, '1002', [
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
    ...lines(IDS.accepted, '1003', [
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
    ...lines(IDS.rejected, '1004', [
        { kind: 'item', product: 'prodwsimaging01', quantity: 3, rate: 15_000, amount: 45_000 },
        {
            kind: 'item',
            product: 'prodsurge8out01',
            quantity: 3,
            rate: 3_400,
            amount: 10_200,
            taxable: true,
        },
    ]),
    // Taxable 56 700: 1 644 + 567 + 2 727 = 4 938.
    ...lines(IDS.closed, '1005', GALA_LINES),
] satisfies EstimateLineRecord[]

// Estimate 1005 converted (spec §3.7): customer, Bill to, Email, Tax, every line and the
// message; the invoice's own date, terms and due date; no memo.
const stJude = CUSTOMERS.find(row => row.id === CUSTOMER_IDS.stJude)
if (!stJude) throw new Error('estimate fixture: the St. Jude customer is missing')

export const CONVERTED_INVOICE = {
    id: CONVERTED_INVOICE_ID,
    customer: CUSTOMER_IDS.stJude,
    status: 'draft',
    number: '',
    sequence: 0,
    date: '2026-11-04',
    due_date: '2026-12-04',
    terms: 'net_30',
    bill_to: stJude.billing_address,
    email: stJude.email,
    tax_rate: TAX_IDS.denverCombined,
    message: DEFAULT_ESTIMATE_MESSAGE,
    memo: '',
    subtotal: 181_700,
    tax_total: 4_938,
    total: 186_638,
    currency: ESTIMATE_CURRENCY,
    entry: '',
    replaces: '',
    replaced_by: '',
    posted_by: '',
    posted_at: '',
    voided_by: '',
    voided_at: '',
    form: '',
    fields: null,
    sort_key: '',
    created: STAMP,
    updated: STAMP,
    estimate: IDS.closed,
} satisfies ConvertedInvoiceRecord

export const CONVERTED_INVOICE_LINES = GALA_LINES.map((seed, position) => ({
    id: `invle1005${String(position).padStart(2, '0')}`.padEnd(15, '0'),
    invoice: CONVERTED_INVOICE_ID,
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
})) satisfies BooksInvoiceLines[]

// A fixture that names a missing product or tax rate is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set([...PRODUCTS, ...INVOICE_PRODUCTS].map(row => row.id))
for (const line of [...ESTIMATE_LINES, ...CONVERTED_INVOICE_LINES]) {
    if (line.product !== '' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`estimate fixture: line ${line.id} names an unknown product`)
    }
}
for (const row of [...ESTIMATES, CONVERTED_INVOICE]) {
    if (row.tax_rate !== '' && !TAX_RATE_ROWS.some(rate => rate.id === row.tax_rate)) {
        throw new Error(`estimate fixture: ${row.id} names an unknown tax rate`)
    }
}
for (const row of ESTIMATES) {
    if (row.expiration_date !== '' && row.expiration_date < row.date) {
        throw new Error(`estimate fixture: ${row.id} expires before its date`)
    }
    if (row.accepted_by.length > 200) {
        throw new Error(`estimate fixture: ${row.id} has an Accepted by over 200 characters`)
    }
}

// What the reference shows for the client checks and the server's refusals (spec §3.3,
// §3.6, §3.7).
export const ESTIMATE_REFUSALS = {
    expirationBeforeDate: "Expiration date can't be before the estimate date.",
    acceptedDateRequired: 'Enter the accepted date.',
    deleteConverted: 'Estimate 1001 has invoice 1004. Set it to Rejected instead.',
    alreadyConverted: 'Estimate 1001 is already on invoice 1004.',
    customerChange: "An invoice from an estimate bills the estimate's customer.",
    customerOnEstimates: 'Old Mill Bakery is on estimates. Make it inactive instead.',
    inactiveProduct:
        'Line 2: Wireless access point is inactive. Choose an active product or service.',
} as const

export const NO_ESTIMATES: EstimateRecord[] = []
