// Synthetic data for the estimate public link (spec §4.4): the rows of the public view
// `books_estimate_public` for every state of the customer's page, and the two estimates
// whose customer declined through the link, for the decline note in Books. Plain data: it
// imports other fixtures and types only, because the seed graph runs in plain node
// (tests/seed-node.test.ts).
//
// The view and the responses collection do not exist yet. EstimatePublicRow and
// EstimateResponseRecord mirror spec §4.2 and §4.3; the migration checkpoint that adds
// `books_estimate_public` and `books_estimate_responses` (and `books_estimates.public_token`)
// must replace both interfaces with the generated types (BooksEstimatePublic,
// BooksEstimateResponses from '../types') and make every array below `satisfies` them.
//
// Amounts are integer cents, as in estimate-form-fixture.ts.

import type { BooksEstimateLines, BooksEstimates } from '../types'
import { COMPANY_SETTINGS, LONG_COMPANY_SETTINGS } from './books-settings-fixture'
import { CUSTOMERS } from './customer-form-fixture'
import {
    DEFAULT_ESTIMATE_MESSAGE,
    ESTIMATE_CURRENCY,
    ESTIMATE_IDS,
    ESTIMATES,
} from './estimate-form-fixture'
import { PRODUCT_IDS } from './products-services-fixture'

// Spec §4.2: the columns of the public view, nothing else.
export interface EstimatePublicRow {
    id: string
    token: string
    number: string
    status: BooksEstimates['status']
    date: string
    expiration_date: string
    accepted_by: string
    accepted_date: string
    total: number
    currency: string
    message: string
    customer_name: string
    business_name: string
    business_email: string
    business_phone: string
}

// Spec §4.3: one customer answer through the link.
export interface EstimateResponseRecord {
    id: string
    estimate: string
    decision: 'accepted' | 'declined'
    name: string
    reason: string
    created: string
}

// "Today" for the reference, as the estimate form's fixture: 1001 is open, 1002 expired.
export { ESTIMATE_TODAY as PUBLIC_TODAY } from './estimate-form-fixture'

// A public token is 43 URL-safe characters (spec §4.1). The fixture's are readable on
// purpose; the server makes real ones from a random source.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function tokenOf(tag: string): string {
    return `pub_${tag}_`.padEnd(43, '0')
}

const STAMP = '2026-11-12 09:00:00.000Z'

const LONG_MESSAGE =
    'Thank you for the chance to quote the annex network refresh. The price covers every item on the attached estimate, installed and tested over two weeks from the start date we agree on. Parts are billed at cost plus ten percent. If the scope changes after the walk-through, we send a revised estimate before any extra work starts.'

function customerName(id: string): string {
    const customer = CUSTOMERS.find(row => row.id === id)
    if (!customer) throw new Error(`estimate public fixture: unknown customer ${id}`)
    return customer.display_name
}

function estimateRow(id: string): BooksEstimates {
    const row = ESTIMATES.find(estimate => estimate.id === id)
    if (!row) throw new Error(`estimate public fixture: unknown estimate ${id}`)
    return row
}

type Business = Pick<EstimatePublicRow, 'business_name' | 'business_email' | 'business_phone'>

const BUSINESS: Business = {
    business_name: COMPANY_SETTINGS.business_name,
    business_email: COMPANY_SETTINGS.email,
    business_phone: COMPANY_SETTINGS.phone,
}

// A long business name and neither email nor phone: no "Questions?" line.
const LONG_BUSINESS: Business = {
    business_name: LONG_COMPANY_SETTINGS.business_name,
    business_email: '',
    business_phone: '',
}

function publicRow(id: string, tag: string, extra: Partial<EstimatePublicRow> = {}) {
    const row = estimateRow(id)
    return {
        id: row.id,
        token: tokenOf(tag),
        number: row.number,
        status: row.status,
        date: row.date,
        expiration_date: row.expiration_date,
        accepted_by: row.accepted_by,
        accepted_date: row.accepted_date,
        total: row.total,
        currency: row.currency || ESTIMATE_CURRENCY,
        message: row.message,
        customer_name: customerName(row.customer),
        ...BUSINESS,
        ...extra,
    } satisfies EstimatePublicRow
}

// One row per state of the public page (spec §3.4). The page decides from `status` and
// `expiration_date` against today; `stateOf` in the route names the state.
export const PUBLIC_ROWS = {
    // Pending, expires 2027-01-15: Accept and Decline show.
    pending: publicRow(ESTIMATE_IDS.pending, 'pending1001'),
    // Pending with a long business name, a long customer name, a long message and no
    // contact line: wrapping, and the page without "Questions?".
    pendingLong: publicRow(ESTIMATE_IDS.closed, 'pendinglong1005', {
        status: 'pending',
        number: '1005',
        accepted_by: '',
        accepted_date: '',
        message: LONG_MESSAGE,
        ...LONG_BUSINESS,
    }),
    // Pending, no expiration date and an empty message: neither line shows.
    pendingBare: publicRow(ESTIMATE_IDS.rejected, 'pendingbare1004', {
        status: 'pending',
        message: '',
    }),
    // Pending but expired on 2026-10-31: no buttons.
    expired: publicRow(ESTIMATE_IDS.expired, 'expired1002'),
    // Accepted, with a long Accepted by.
    accepted: publicRow(ESTIMATE_IDS.accepted, 'accepted1003'),
    // Rejected by hand in Books (no response row).
    rejected: publicRow(ESTIMATE_IDS.rejected, 'rejected1004'),
    // Closed: made into an invoice.
    closed: publicRow(ESTIMATE_IDS.closed, 'closed1005'),
} as const

// A link whose token no row has: the Not found state.
export const UNKNOWN_TOKEN = tokenOf('nosuchlink')

// What the Accept step shows typed (at most 200 characters, spec §3.3).
export const TYPED_NAME = 'Dana Whitfield, facilities manager'

// A decline reason that wraps over several lines (at most 1000 characters).
export const LONG_DECLINE_REASON =
    'We decided to keep the existing access points for one more year and spend this budget on the kitchen remodel instead.\nThe quote itself was clear and fair; please send a new one next spring, and include the option to reuse our current cabling so we can compare the two.'

// The server's refusal texts and the network failure text (spec §3.3, §4.3).
export const PUBLIC_REFUSALS = {
    noLongerPending: 'This estimate is no longer waiting for an answer.',
    expired: 'This estimate expired on Oct 31, 2026.',
    network: 'Could not send. Check your connection and try again.',
} as const

// The two estimates whose customer declined through the link (spec §4.4). The seed
// creates them Pending, expiring after today, and then inserts each DECLINE_RESPONSES row
// as the app; the response hook sets the estimate to Rejected. Their numbers follow
// 1001 to 1005 of estimate-form-fixture.ts.
export const DECLINE_ESTIMATE_IDS = {
    // A decline with a long reason over several lines.
    longReason: 'estm1006bluefn1',
    // A decline with an empty reason: only "Declined by the customer on <date>."
    noReason: 'estm1007cedar01',
} as const

const DECLINE_IDS = DECLINE_ESTIMATE_IDS

type DeclineSeed = Pick<BooksEstimates, 'id' | 'customer' | 'number' | 'sequence' | 'date'> &
    Pick<BooksEstimates, 'subtotal' | 'total'>

function pendingEstimate(seed: DeclineSeed): BooksEstimates {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`estimate public fixture: ${seed.id} names an unknown customer`)
    return {
        status: 'pending',
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        expiration_date: '2027-02-01',
        accepted_by: '',
        accepted_date: '',
        message: DEFAULT_ESTIMATE_MESSAGE,
        memo: '',
        tax_total: 0,
        revision: 1,
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

// Created Pending; the decline response makes each one Rejected.
export const DECLINE_ESTIMATES = [
    pendingEstimate({
        id: DECLINE_IDS.longReason,
        customer: 'cust_bluef_0001',
        number: '1006',
        sequence: 1006,
        date: '2026-11-05',
        subtotal: 113_400,
        total: 113_400,
    }),
    pendingEstimate({
        id: DECLINE_IDS.noReason,
        customer: 'cust_cedar_0001',
        number: '1007',
        sequence: 1007,
        date: '2026-11-06',
        subtotal: 125_000,
        total: 125_000,
    }),
] satisfies BooksEstimates[]

export const DECLINE_ESTIMATE_LINES = [
    {
        id: 'estl10060000000',
        estimate: DECLINE_IDS.longReason,
        kind: 'item',
        product: PRODUCT_IDS.accessPoint,
        description: 'Wi-Fi 6E ceiling-mount access point, installed and configured.',
        quantity: 6,
        rate: 18_900,
        percent_ppm: 0,
        amount: 113_400,
        taxable: false,
        position: 0,
        created: STAMP,
        updated: STAMP,
    },
    {
        id: 'estl10070000000',
        estimate: DECLINE_IDS.noReason,
        kind: 'item',
        product: PRODUCT_IDS.taxPrep,
        description: 'Federal and state return for a small business, with one round of review.',
        quantity: 1,
        rate: 125_000,
        percent_ppm: 0,
        amount: 125_000,
        taxable: false,
        position: 0,
        created: STAMP,
        updated: STAMP,
    },
] satisfies BooksEstimateLines[]

// The customer's decline of each; `created` is what the note's date reads. The seed's
// rows get the server's time; these are for the reference.
export const DECLINE_RESPONSES = [
    {
        id: 'estr1006declin1',
        estimate: DECLINE_IDS.longReason,
        decision: 'declined',
        name: '',
        reason: LONG_DECLINE_REASON,
        created: '2026-11-11 16:42:10.000Z',
    },
    {
        id: 'estr1007declin1',
        estimate: DECLINE_IDS.noReason,
        decision: 'declined',
        name: '',
        reason: '',
        created: '2026-11-12 08:15:00.000Z',
    },
] satisfies EstimateResponseRecord[]

// What the reference shows for each declined estimate: Rejected, after the response.
export const DECLINED_ESTIMATES = DECLINE_ESTIMATES.map(row => ({
    ...row,
    status: 'rejected' as const,
}))

// A fixture row that breaks the schema's bounds is a fixture bug, not data.
for (const row of Object.values(PUBLIC_ROWS)) {
    if (!TOKEN_PATTERN.test(row.token)) {
        throw new Error(`estimate public fixture: ${row.id} has a malformed token`)
    }
}
for (const response of DECLINE_RESPONSES) {
    if (response.reason.length > 1000 || response.name.length > 200) {
        throw new Error(`estimate public fixture: ${response.id} is over the length bounds`)
    }
}
