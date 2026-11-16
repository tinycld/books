// Synthetic credit memos for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents), entered positive (spec §3.4): `amount`,
// `subtotal`, `tax_total` and `total` are the values the server writes at every save, as
// in invoice-form-fixture.ts. `balance` is the credit not yet applied (spec §4.1): the
// total of a posted memo, 0 on a draft and on a void one. The posted tax snapshot
// (CREDIT_MEMO_TAX_LINES) is negative (spec §4.3, Q5).
//
// CreditMemoRecord, CreditMemoLineRecord and CreditMemoTaxLineRecord are LOCAL types that
// mirror spec §4.1, derived from the generated invoice types. The collections do not exist
// yet: the migration checkpoint (2100000022_create_books_credit_memos.js) must replace
// them with the generated `BooksCreditMemos`, `BooksCreditMemoLines` and
// `BooksCreditMemoTaxLines` through `satisfies`.

import type { BooksInvoiceLines, BooksInvoices, BooksInvoiceTaxLines } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import {
    DISCOUNT_PRODUCT_ID,
    INVOICE_IDS,
    INVOICE_LINES,
    INVOICE_PRODUCTS,
    INVOICE_USER_IDS,
    INVOICE_USER_NAMES,
    INVOICES,
} from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export const CREDIT_MEMO_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const CREDIT_MEMO_TODAY = '2026-11-16'

const STAMP = '2026-11-16 09:00:00.000Z'

// Spec §4.1: the invoice's fields without terms, due date and the estimate link; `invoice`
// is the optional link to the invoice the memo was made from.
export type CreditMemoRecord = Omit<BooksInvoices, 'terms' | 'due_date' | 'estimate'> & {
    invoice: string
}
export type CreditMemoLineRecord = Omit<BooksInvoiceLines, 'invoice'> & { credit_memo: string }
export type CreditMemoTaxLineRecord = Omit<BooksInvoiceTaxLines, 'invoice'> & {
    credit_memo: string
}
export type CreditMemoStatus = CreditMemoRecord['status']

// The users the read view names in "Posted by" and "Voided by".
export const CREDIT_MEMO_USER_IDS = INVOICE_USER_IDS
export const CREDIT_MEMO_USER_NAMES = INVOICE_USER_NAMES

export const CREDIT_MEMO_IDS = {
    // Posted 1001, made from invoice 1004 (Harborview), every line kind, Denver combined.
    posted: 'crmp1001every01',
    // Draft: long customer name and a long description; no invoice link.
    draft: 'crmpdraftstjud1',
    // Draft made from invoice 1004: a second row of that invoice's Credit memos section.
    linkedDraft: 'crmpdraftharbr1',
    // Void 1002, replaced by its correction (same number).
    voided: 'crmp1002void001',
    correction: 'crmp1002fix0001',
    // Posted 1003 of a tax-exempt customer: every line not taxable, tax $0.00.
    exempt: 'crmp1003exempt1',
    // Posted 1004 with no tax chosen: no tax line. Its invoice (1001) was voided after
    // the memo posted, so its link reads "For invoice 1001 (void)" (Q18).
    noTax: 'crmp1004notax01',
} as const

const IDS = CREDIT_MEMO_IDS

// Aspen Ridge Dental: a customer-form fixture row with no CUSTOMER_IDS key.
const ASPEN_RIDGE = 'cust_aspen_0001'

type MemoSeed = Pick<CreditMemoRecord, 'id' | 'customer' | 'status' | 'date'> &
    Partial<CreditMemoRecord>

function memo(seed: MemoSeed): CreditMemoRecord {
    const customer = CUSTOMERS.find(row => row.id === seed.customer)
    if (!customer) throw new Error(`credit memo fixture: ${seed.id} names an unknown customer`)
    return {
        number: '',
        sequence: 0,
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: '',
        // Spec §3.5, Q8: a new credit memo's message starts empty.
        message: '',
        memo: '',
        subtotal: 0,
        tax_total: 0,
        total: 0,
        // What posting writes: the whole credit is unapplied until p2-apply-credit.
        balance: seed.status === 'posted' ? (seed.total ?? 0) : 0,
        revision: 1,
        currency: CREDIT_MEMO_CURRENCY,
        entry: '',
        invoice: '',
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
        ...seed,
    }
}

export const CREDIT_MEMOS = [
    memo({
        id: IDS.posted,
        customer: CUSTOMER_IDS.harborview,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-11-10',
        tax_rate: TAX_IDS.denverCombined,
        invoice: INVOICE_IDS.posted,
        message: 'Credit for the access points that were returned, as agreed on November 9.',
        memo: 'Returned hardware, approved by Dana at Harborview',
        subtotal: 130_470,
        tax_total: 4_207,
        total: 134_677,
        entry: 'jecreditm100101',
        posted_by: CREDIT_MEMO_USER_IDS.ana,
        posted_at: '2026-11-10 22:14:00.000Z',
    }),
    memo({
        id: IDS.draft,
        customer: CUSTOMER_IDS.stJude,
        status: 'draft',
        date: CREDIT_MEMO_TODAY,
        tax_rate: TAX_IDS.denverCombined,
        memo: 'Waiting for the foundation to confirm the cable count',
        subtotal: 11_500,
        tax_total: 305,
        total: 11_805,
    }),
    memo({
        id: IDS.linkedDraft,
        customer: CUSTOMER_IDS.harborview,
        status: 'draft',
        date: CREDIT_MEMO_TODAY,
        tax_rate: TAX_IDS.denverCombined,
        invoice: INVOICE_IDS.posted,
        subtotal: 8_000,
        total: 8_000,
    }),
    memo({
        id: IDS.voided,
        customer: ASPEN_RIDGE,
        status: 'void',
        number: '1002',
        sequence: 1002,
        date: '2026-11-11',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 55_200,
        tax_total: 889,
        total: 56_089,
        entry: 'jecreditm100201',
        replaced_by: IDS.correction,
        posted_by: CREDIT_MEMO_USER_IDS.ana,
        posted_at: '2026-11-11 15:40:00.000Z',
        voided_by: CREDIT_MEMO_USER_IDS.omar,
        voided_at: '2026-11-12 10:05:00.000Z',
    }),
    memo({
        id: IDS.correction,
        customer: ASPEN_RIDGE,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-11-11',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 73_600,
        tax_total: 1_184,
        total: 74_784,
        entry: 'jecreditm100202',
        replaces: IDS.voided,
        posted_by: CREDIT_MEMO_USER_IDS.omar,
        posted_at: '2026-11-12 10:05:00.000Z',
    }),
    memo({
        id: IDS.exempt,
        customer: CUSTOMER_IDS.northwind,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-11-12',
        tax_rate: TAX_IDS.denverCombined,
        message: 'Resale certificate CO-98-01234-0000 on file.',
        subtotal: 113_400,
        total: 113_400,
        entry: 'jecreditm100301',
        posted_by: CREDIT_MEMO_USER_IDS.ana,
        posted_at: '2026-11-12 18:30:00.000Z',
    }),
    memo({
        id: IDS.noTax,
        customer: CUSTOMER_IDS.alvarez,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-13',
        invoice: INVOICE_IDS.noTax,
        memo: 'Duplicate October charge',
        subtotal: 25_000,
        total: 25_000,
        entry: 'jecreditm100401',
        posted_by: CREDIT_MEMO_USER_IDS.omar,
        posted_at: '2026-11-13 16:20:00.000Z',
    }),
] satisfies CreditMemoRecord[]

// The memo the seed posts (spec §4.6: linked to a seeded posted invoice of the same
// customer, with "Denver combined" tax) and the draft it keeps. The plan picks the days
// after it greps the report specs (spec §4.6); the fixture's days are for the reference.
export const CREDIT_MEMO_SEED_IDS = [IDS.posted] as const
export const CREDIT_MEMO_SEED_DRAFT_ID = IDS.draft

type LineSeed = Pick<CreditMemoLineRecord, 'kind'> & Partial<CreditMemoLineRecord>

function lines(memoId: string, tag: string, seeds: LineSeed[]): CreditMemoLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `crml${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        credit_memo: memoId,
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
    'A technician visited, found the fault and left a written plan, but the fix did not hold. Travel inside the Portland metro area was included; this credit covers the time past the first two hours, billed in fifteen-minute steps, and the second visit.'

// Every line kind: three items (two taxable), a subtotal, a -10% discount on it, a
// description line and an item with a long description. Taxable total 48 300:
// Colorado state 1 401 + RTD transit 483 + Denver city 2 323 = 4 207.
export const CREDIT_MEMO_LINES = [
    ...lines(IDS.posted, '1001', [
        {
            kind: 'item',
            product: 'prodbookkeep001',
            description: 'Bookkeeping for October 2026, billed twice.',
            quantity: 1,
            rate: 50_000,
            amount: 50_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E ceiling-mount access point, returned unopened.',
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
        { kind: 'subtotal', amount: 98_300 },
        {
            kind: 'percent',
            product: DISCOUNT_PRODUCT_ID,
            description: 'Returning-client discount, taken back with the credit',
            percent_ppm: -100_000,
            amount: -9_830,
        },
        {
            kind: 'description',
            description: 'Returned at the front office on November 9. Credit stays on the account.',
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
    // Taxable 3 500: 102 + 35 + 168 = 305.
    ...lines(IDS.draft, 'drft', [
        {
            kind: 'item',
            product: PRODUCT_IDS.taxPrep,
            description:
                'Partial credit for the donor receipt run: forty receipts were printed with the wrong event date and had to be printed again by the foundation.',
            quantity: 1,
            rate: 8_000,
            amount: 8_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft, not delivered',
            quantity: 4,
            rate: 875,
            amount: 3_500,
            taxable: true,
        },
    ]),
    ...lines(IDS.linkedDraft, 'lnkd', [
        {
            kind: 'item',
            product: 'prodbookkeep001',
            description: 'Goodwill credit for the late October close.',
            quantity: 1,
            rate: 8_000,
            amount: 8_000,
        },
    ]),
    // Taxable 10 200: 296 + 102 + 491 = 889.
    ...lines(IDS.voided, '1002', [
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
    // Taxable 13 600: 394 + 136 + 654 = 1 184.
    ...lines(IDS.correction, 'fix2', [
        { kind: 'item', product: 'prodwsimaging01', quantity: 4, rate: 15_000, amount: 60_000 },
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
            description: 'Wi-Fi 6E ceiling-mount access point, bought for resale and returned.',
            quantity: 6,
            rate: 18_900,
            amount: 113_400,
        },
    ]),
    ...lines(IDS.noTax, '1004', [
        {
            kind: 'item',
            product: PRODUCT_IDS.taxPrep,
            description: 'Refund of the duplicate October charge.',
            quantity: 1,
            rate: 25_000,
            amount: 25_000,
        },
    ]),
] satisfies CreditMemoLineRecord[]

const DENVER_COMPONENTS = [
    { component: TAX_IDS.state, agency: TAX_IDS.colorado, rate_ppm: 29_000 },
    { component: TAX_IDS.rtd, agency: TAX_IDS.colorado, rate_ppm: 10_000 },
    { component: TAX_IDS.denverCity, agency: TAX_IDS.denver, rate_ppm: 48_100 },
] as const

// A credit kind writes the snapshot negated (spec §4.3); a zero stays 0, never -0.
const negated = (cents: number) => (cents === 0 ? 0 : -cents)

function denverTaxLines(
    memoId: string,
    tag: string,
    taxable: number,
    amounts: readonly [number, number, number]
): CreditMemoTaxLineRecord[] {
    const row = CREDIT_MEMOS.find(candidate => candidate.id === memoId)
    if (!row) throw new Error(`credit memo fixture: tax lines name an unknown memo ${memoId}`)
    return DENVER_COMPONENTS.map((part, position) => ({
        id: `crmt${tag}${position}`.padEnd(15, '0'),
        credit_memo: memoId,
        rate: TAX_IDS.denverCombined,
        ...part,
        gross_amount: negated(row.subtotal),
        taxable_amount: negated(taxable),
        currency: row.currency,
        amount: negated(amounts[position]),
        position,
        date: row.date,
        created: STAMP,
        updated: STAMP,
    }))
}

// The posting snapshot of each posted or void memo that has a tax rate.
export const CREDIT_MEMO_TAX_LINES = [
    ...denverTaxLines(IDS.posted, '1001', 48_300, [1_401, 483, 2_323]),
    ...denverTaxLines(IDS.voided, '1002', 10_200, [296, 102, 491]),
    ...denverTaxLines(IDS.correction, 'fix2', 13_600, [394, 136, 654]),
    ...denverTaxLines(IDS.exempt, '1003', 0, [0, 0, 0]),
] satisfies CreditMemoTaxLineRecord[]

// What a memo's link row reads from its invoice (spec §3.2, §3.7): the number, and
// whether that invoice is void now ("For invoice 1001 (void)", Q18). Invoice 1001 is
// posted in the invoice fixture; this table is its state after a later void.
export type CreditMemoInvoiceLink = { invoice: string; number: string; isVoid: boolean }
export const CREDIT_MEMO_INVOICE_LINKS: Record<string, CreditMemoInvoiceLink> = {
    [INVOICE_IDS.posted]: { invoice: INVOICE_IDS.posted, number: '1004', isVoid: false },
    [INVOICE_IDS.noTax]: { invoice: INVOICE_IDS.noTax, number: '1001', isVoid: true },
}

export function creditMemoLinkLabel(link: CreditMemoInvoiceLink): string {
    const suffix = link.isVoid ? ' (void)' : ''
    return `For invoice ${link.number}${suffix}`
}

// "Create credit memo" on invoice 1004 (spec §3.2, Q20): the new form starts with the
// invoice's customer, Bill to, Email, Tax and a copy of every line; today's date, an empty
// message and an empty memo. Its totals are the invoice's.
const SOURCE_INVOICE = INVOICES.find(row => row.id === INVOICE_IDS.posted)
if (!SOURCE_INVOICE) throw new Error('credit memo fixture: the source invoice is missing')

export const CREDIT_MEMO_FROM_INVOICE = memo({
    id: '',
    customer: SOURCE_INVOICE.customer,
    status: 'draft',
    date: CREDIT_MEMO_TODAY,
    bill_to: SOURCE_INVOICE.bill_to,
    email: SOURCE_INVOICE.email,
    tax_rate: SOURCE_INVOICE.tax_rate,
    invoice: SOURCE_INVOICE.id,
    subtotal: SOURCE_INVOICE.subtotal,
    tax_total: SOURCE_INVOICE.tax_total,
    total: SOURCE_INVOICE.total,
})

export const CREDIT_MEMO_FROM_INVOICE_LINES: CreditMemoLineRecord[] = INVOICE_LINES.filter(
    line => line.invoice === SOURCE_INVOICE.id
).map(({ invoice: _invoice, ...line }) => ({ ...line, credit_memo: '' }))

// The invoice read view's "Credit memos" section (spec §3.10): the memos that name the
// invoice and are not a replaced original, oldest first.
export function creditMemosOfInvoice(invoiceId: string): CreditMemoRecord[] {
    return CREDIT_MEMOS.filter(row => row.invoice === invoiceId && row.replaced_by === '').sort(
        (a, b) => a.date.localeCompare(b.date)
    )
}

// The customer's Transactions tab (spec §3.10, Q11): Draft, Unapplied (a balance above
// zero), Applied (balance zero; only once p2-apply-credit exists) or Void.
export type CreditMemoListStatus = 'draft' | 'unapplied' | 'applied' | 'void'
export function creditMemoListStatus(
    row: Pick<CreditMemoRecord, 'status' | 'balance'>
): CreditMemoListStatus {
    if (row.status === 'draft') return 'draft'
    if (row.status === 'void') return 'void'
    return row.balance > 0 ? 'unapplied' : 'applied'
}

export function creditMemosOfCustomer(customerId: string): CreditMemoRecord[] {
    return CREDIT_MEMOS.filter(row => row.customer === customerId).sort((a, b) =>
        b.date.localeCompare(a.date)
    )
}

// A fixture that names a missing product, tax rate or invoice is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set([...PRODUCTS, ...INVOICE_PRODUCTS].map(row => row.id))
for (const line of [...CREDIT_MEMO_LINES, ...CREDIT_MEMO_FROM_INVOICE_LINES]) {
    if (line.product !== '' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`credit memo fixture: line ${line.id} names an unknown product`)
    }
}
for (const row of CREDIT_MEMOS) {
    if (row.tax_rate !== '' && !TAX_RATE_ROWS.some(rate => rate.id === row.tax_rate)) {
        throw new Error(`credit memo fixture: ${row.id} names an unknown tax rate`)
    }
    if (row.invoice === '') continue
    const source = INVOICES.find(invoice => invoice.id === row.invoice)
    if (!source || source.customer !== row.customer) {
        throw new Error(`credit memo fixture: ${row.id} names an invoice of another customer`)
    }
    if (!CREDIT_MEMO_INVOICE_LINKS[row.invoice]) {
        throw new Error(`credit memo fixture: ${row.id} has no link view for its invoice`)
    }
}

// What the reference shows for the client rules and the server's refusals (spec §3.5,
// §3.6, §3.9, §3.10).
export const CREDIT_MEMO_REFUSALS = {
    inactiveCustomer: 'Old Mill Bakery is inactive. Choose an active customer.',
    zeroTotal:
        'A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft.',
    negativeTotal: 'A credit memo total cannot be below zero. Use an invoice.',
    tooLarge: 'The credit memo total is more than Books can store.',
    invoiceLink: 'Choose a posted invoice of this customer.',
    inactiveProduct:
        'Line 2: Wireless access point is inactive. Choose an active product or service.',
    noLines: 'Add at least one product or service line',
    noAccess: 'You need bookkeeper access to create credit memos',
    notFound: 'This credit memo does not exist',
    cannotEdit: 'This credit memo cannot be edited',
    cannotCredit: 'This invoice cannot be credited',
    invoiceCustomerLocked:
        'Credit memos are made from this invoice, so its customer cannot change.',
    customerOnMemos: 'Harborview Hospitality Group is on credit memos. Make it inactive instead.',
} as const

export const NO_CREDIT_MEMOS: CreditMemoRecord[] = []
