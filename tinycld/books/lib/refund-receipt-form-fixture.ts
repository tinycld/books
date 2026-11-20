// Synthetic refund receipts for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents), entered positive (spec §3.5): `amount`,
// `subtotal`, `tax_total` and `total` are the values the server writes at every save, as
// in sales-receipt-form-fixture.ts. The posted tax snapshot (REFUND_RECEIPT_TAX_LINES)
// holds each figure negated (spec §4.1, §4.3), and a payout of a credit memo has none.

import type {
    BooksCreditMemoLines,
    BooksCreditMemos,
    BooksRefundReceiptCredits,
    BooksRefundReceiptLines,
    BooksRefundReceipts,
    BooksRefundReceiptTaxLines,
} from '../types'
import {
    CREDIT_MEMO_IDS,
    CREDIT_MEMO_LINES,
    CREDIT_MEMOS,
    type CreditMemoRecord,
} from './credit-memo-form-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import type { DepositAccountRow } from './deposit-accounts'
import { DISCOUNT_PRODUCT_ID, INVOICE_PRODUCTS } from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import {
    DEPOSIT_ACCOUNT_IDS,
    DEPOSIT_ACCOUNTS,
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPT_USER_IDS,
    SALES_RECEIPT_USER_NAMES,
    SALES_RECEIPTS,
} from './sales-receipt-form-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export const REFUND_RECEIPT_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const REFUND_RECEIPT_TODAY = '2026-11-18'

const STAMP = '2026-11-18 09:00:00.000Z'

// The generated record types (migration 2100000025_create_books_refund_receipts.js), so a
// fixture row that drifts from the schema fails tsc. A credits row is the server-written
// payer row of a credit memo's balance: one for each posted payout.
export type RefundReceiptRecord = BooksRefundReceipts
export type RefundReceiptLineRecord = BooksRefundReceiptLines
export type RefundReceiptTaxLineRecord = BooksRefundReceiptTaxLines
export type RefundReceiptCreditRecord = BooksRefundReceiptCredits
export type RefundReceiptStatus = RefundReceiptRecord['status']

// Refund from lists the sales receipt's deposit accounts (spec §3.2, Q3): every active
// bank account and the Undeposited funds accounts, in chart order.
export const REFUND_FROM_ACCOUNT_IDS = DEPOSIT_ACCOUNT_IDS
export const REFUND_FROM_ACCOUNTS: DepositAccountRow[] = DEPOSIT_ACCOUNTS
// A chart with no bank and no Undeposited funds account: Refund from's inline error.
export const NO_REFUND_FROM_ACCOUNTS: DepositAccountRow[] = []

// The posted balance of each account, for the line under Refund from ("Balance $4,077.38").
export const REFUND_FROM_BALANCES: Record<string, number> = {
    [REFUND_FROM_ACCOUNT_IDS.checking]: 407_738,
    [REFUND_FROM_ACCOUNT_IDS.savings]: 1_250_000,
    [REFUND_FROM_ACCOUNT_IDS.undeposited]: 134_677,
}

// The users the read view names in "Posted by" and "Voided by".
export const REFUND_RECEIPT_USER_IDS = SALES_RECEIPT_USER_IDS
export const REFUND_RECEIPT_USER_NAMES = SALES_RECEIPT_USER_NAMES

export const REFUND_RECEIPT_IDS = {
    // Posted 1001, made from sales receipt 1004 (Harborview): every line kind, a long
    // description, Check from 1000 Business Checking.
    posted: 'rfrp1001every01',
    // Posted 1002, no customer and no source, Cash from 1000 Business Checking.
    walkIn: 'rfrp1002walkin1',
    // Draft: long customer name, Credit card with a long reference; no source.
    draft: 'rfrpdraftstjud1',
    // Void 1003, replaced by its correction (same number). The correction names sales
    // receipt 1002, which was voided after the refund posted: "(void)" on its link.
    voided: 'rfrp1003void001',
    correction: 'rfrp1003fix0001',
    // Posted 1004 of a tax-exempt customer, from sales receipt 1003: tax $0.00.
    exempt: 'rfrp1004exempt1',
    // Posted 1005: a payout of part of credit memo 1001 (Harborview), Bank transfer.
    payout: 'rfrp1005payout1',
} as const

const IDS = REFUND_RECEIPT_IDS

// Aspen Ridge Dental: a customer-form fixture row with no CUSTOMER_IDS key.
const ASPEN_RIDGE = 'cust_aspen_0001'

type RefundSeed = Pick<RefundReceiptRecord, 'id' | 'status' | 'date' | 'refund_from'> &
    Partial<RefundReceiptRecord>

function refund(seed: RefundSeed): RefundReceiptRecord {
    const customerId = seed.customer ?? ''
    const customer = CUSTOMERS.find(row => row.id === customerId)
    if (customerId !== '' && !customer) {
        throw new Error(`refund receipt fixture: ${seed.id} names an unknown customer`)
    }
    return {
        customer: customerId,
        number: '',
        sequence: 0,
        bill_to: customer?.billing_address ?? null,
        email: customer?.email ?? '',
        tax_rate: '',
        payment_method: '',
        reference_no: '',
        // Spec §3.6, Q8: a new refund receipt's message starts empty.
        message: '',
        memo: '',
        subtotal: 0,
        tax_total: 0,
        total: 0,
        revision: 1,
        currency: REFUND_RECEIPT_CURRENCY,
        entry: '',
        sales_receipt: '',
        credit_memo: '',
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

// At most 40 characters (spec §3.2), long enough to fill the cell.
export const LONG_REFUND_REFERENCE = 'VISA 4417 refund 918204 terminal 2 ln 03'

export const REFUND_RECEIPTS = [
    refund({
        id: IDS.posted,
        customer: CUSTOMER_IDS.harborview,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-11-12',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '20417',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        sales_receipt: SALES_RECEIPT_IDS.posted,
        message: 'Refund for the Wi-Fi refresh of November 3, as agreed with Dana.',
        memo: 'Whole sale refunded; hardware came back on November 11',
        subtotal: 130_470,
        tax_total: 4_207,
        total: 134_677,
        entry: 'jerefundr100101',
        posted_by: REFUND_RECEIPT_USER_IDS.ana,
        posted_at: '2026-11-12 22:14:00.000Z',
    }),
    refund({
        id: IDS.walkIn,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-11-13',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'cash',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        memo: 'Counter return, cables unopened',
        subtotal: 3_500,
        tax_total: 305,
        total: 3_805,
        entry: 'jerefundr100201',
        posted_by: REFUND_RECEIPT_USER_IDS.omar,
        posted_at: '2026-11-13 17:02:00.000Z',
    }),
    refund({
        id: IDS.draft,
        customer: CUSTOMER_IDS.stJude,
        status: 'draft',
        date: REFUND_RECEIPT_TODAY,
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'credit_card',
        reference_no: LONG_REFUND_REFERENCE,
        refund_from: REFUND_FROM_ACCOUNT_IDS.undeposited,
        memo: 'Waiting for the foundation to confirm the cable count',
        subtotal: 11_500,
        tax_total: 305,
        total: 11_805,
    }),
    refund({
        id: IDS.voided,
        customer: ASPEN_RIDGE,
        status: 'void',
        number: '1003',
        sequence: 1003,
        date: '2026-11-14',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '20418',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        sales_receipt: SALES_RECEIPT_IDS.correction,
        subtotal: 55_200,
        tax_total: 889,
        total: 56_089,
        entry: 'jerefundr100301',
        replaced_by: IDS.correction,
        posted_by: REFUND_RECEIPT_USER_IDS.ana,
        posted_at: '2026-11-14 15:40:00.000Z',
        voided_by: REFUND_RECEIPT_USER_IDS.omar,
        voided_at: '2026-11-16 10:05:00.000Z',
    }),
    refund({
        id: IDS.correction,
        customer: ASPEN_RIDGE,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-11-14',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '20418',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        sales_receipt: SALES_RECEIPT_IDS.correction,
        subtotal: 73_600,
        tax_total: 1_184,
        total: 74_784,
        entry: 'jerefundr100302',
        replaces: IDS.voided,
        posted_by: REFUND_RECEIPT_USER_IDS.omar,
        posted_at: '2026-11-16 10:05:00.000Z',
    }),
    refund({
        id: IDS.exempt,
        customer: CUSTOMER_IDS.northwind,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-16',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'debit_card',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        sales_receipt: SALES_RECEIPT_IDS.exempt,
        message: 'Resale certificate CO-98-01234-0000 on file.',
        subtotal: 37_800,
        total: 37_800,
        entry: 'jerefundr100401',
        posted_by: REFUND_RECEIPT_USER_IDS.ana,
        posted_at: '2026-11-16 18:30:00.000Z',
    }),
    refund({
        id: IDS.payout,
        customer: CUSTOMER_IDS.harborview,
        status: 'posted',
        number: '1005',
        sequence: 1005,
        date: '2026-11-17',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'bank_transfer',
        refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
        credit_memo: CREDIT_MEMO_IDS.posted,
        memo: 'Harborview asked for the access point credit back by transfer',
        subtotal: 37_800,
        tax_total: 3_292,
        total: 41_092,
        entry: 'jerefundr100501',
        posted_by: REFUND_RECEIPT_USER_IDS.omar,
        posted_at: '2026-11-17 16:20:00.000Z',
    }),
] satisfies RefundReceiptRecord[]

// The seed's payout of part of its own credit memo (REFUND_SEED_PAYOUT, below).
const SEED_PAYOUT_ID = 'rfrpseedpayout1'

// What the seed posts (spec §4.6, plan decision "Seed pick"): the refund of the seeded
// sales receipt 1004 (Harborview, 2026-11-12, Check 20417 from 1000 Business Checking),
// then the payout of part of the seed-only credit memo; and the draft it keeps.
export const REFUND_RECEIPT_SEED_IDS = [IDS.posted, SEED_PAYOUT_ID] as const
export const REFUND_RECEIPT_SEED_DRAFT_ID = IDS.draft

type LineSeed = Pick<RefundReceiptLineRecord, 'kind'> & Partial<RefundReceiptLineRecord>

function lines(refundId: string, tag: string, seeds: LineSeed[]): RefundReceiptLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `rfrl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        refund_receipt: refundId,
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
    'A technician visited, found the fault and left a written plan, but the fix did not hold and the client asked for the money back. Travel inside the Portland metro area was included; this refund covers the whole visit as one flat amount.'

// Every line kind: three items (two taxable), a subtotal, a -10% discount on it, a
// description line and an item with a long description. Taxable total 48 300:
// Colorado state 1 401 + RTD transit 483 + Denver city 2 323 = 4 207.
export const REFUND_RECEIPT_LINES = [
    ...lines(IDS.posted, '1001', [
        {
            kind: 'item',
            product: 'prodbookkeep001',
            description: 'Bookkeeping for October 2026, refunded.',
            quantity: 1,
            rate: 50_000,
            amount: 50_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E ceiling-mount access point, taken down and returned.',
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
            description: 'Returning-client discount, taken back with the refund',
            percent_ppm: -100_000,
            amount: -9_830,
        },
        {
            kind: 'description',
            description: 'Hardware came back to the front office on November 11. Paid by check.',
        },
        // One unit, not the 1.5 the seeded invoice, sales receipt and credit memo carry:
        // with 1.5 the long-named product's seeded quantity nets to 0, and Sales by
        // product blanks its Quantity and Avg price (D13), the figures the phone e2e reads.
        {
            kind: 'item',
            product: PRODUCT_IDS.networkVisit,
            description: LONG_VISIT,
            quantity: 1,
            rate: 42_000,
            amount: 42_000,
        },
    ]),
    // Taxable 3 500: 102 + 35 + 168 = 305.
    ...lines(IDS.walkIn, '1002', [
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft, returned unopened',
            quantity: 4,
            rate: 875,
            amount: 3_500,
            taxable: true,
        },
    ]),
    // Taxable 3 500: 102 + 35 + 168 = 305.
    ...lines(IDS.draft, 'drft', [
        {
            kind: 'item',
            product: PRODUCT_IDS.taxPrep,
            description:
                'Part of the donor receipt run: forty receipts were printed with the wrong event date and had to be printed again by the foundation, so that share of the fee goes back.',
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
    // Taxable 10 200: 296 + 102 + 491 = 889.
    ...lines(IDS.voided, '1003', [
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
    ...lines(IDS.correction, 'fix3', [
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
    ...lines(IDS.exempt, '1004', [
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E ceiling-mount access point, bought for resale and returned.',
            quantity: 2,
            rate: 18_900,
            amount: 37_800,
        },
    ]),
    // The payout: two of the credited access points. Taxable 37 800:
    // 1 096 + 378 + 1 818 = 3 292. The lines print; they post no income and no tax.
    ...lines(IDS.payout, '1005', [
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description:
                'Wi-Fi 6E ceiling-mount access point: the credit of November 10, paid back.',
            quantity: 2,
            rate: 18_900,
            amount: 37_800,
            taxable: true,
        },
    ]),
] satisfies RefundReceiptLineRecord[]

const DENVER_COMPONENTS = [
    { component: TAX_IDS.state, agency: TAX_IDS.colorado, rate_ppm: 29_000 },
    { component: TAX_IDS.rtd, agency: TAX_IDS.colorado, rate_ppm: 10_000 },
    { component: TAX_IDS.denverCity, agency: TAX_IDS.denver, rate_ppm: 48_100 },
] as const

// A refund writes the snapshot negated (spec §4.3); a zero stays 0, never -0.
const negated = (cents: number) => (cents === 0 ? 0 : -cents)

function denverTaxLines(
    refundId: string,
    tag: string,
    taxable: number,
    amounts: readonly [number, number, number]
): RefundReceiptTaxLineRecord[] {
    const row = REFUND_RECEIPTS.find(candidate => candidate.id === refundId)
    if (!row)
        throw new Error(`refund receipt fixture: tax lines name an unknown refund ${refundId}`)
    return DENVER_COMPONENTS.map((part, position) => ({
        id: `rfrt${tag}${position}`.padEnd(15, '0'),
        refund_receipt: refundId,
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

// The posting snapshot of each posted or void plain refund. The payout (1005) has none:
// its credit memo's tax lines counted already (spec §3.13, Q10).
export const REFUND_RECEIPT_TAX_LINES = [
    ...denverTaxLines(IDS.posted, '1001', 48_300, [1_401, 483, 2_323]),
    ...denverTaxLines(IDS.walkIn, '1002', 3_500, [102, 35, 168]),
    ...denverTaxLines(IDS.voided, '1003', 10_200, [296, 102, 491]),
    ...denverTaxLines(IDS.correction, 'fix3', 13_600, [394, 136, 654]),
    ...denverTaxLines(IDS.exempt, '1004', 0, [0, 0, 0]),
] satisfies RefundReceiptTaxLineRecord[]

// The payer rows the server writes (spec §4.1): one for each posted payout.
export const REFUND_RECEIPT_CREDITS = [
    {
        id: 'rfrc1005payout1',
        refund_receipt: IDS.payout,
        credit_memo: CREDIT_MEMO_IDS.posted,
        amount: 41_092,
        position: 0,
        created: STAMP,
        updated: STAMP,
    },
] satisfies RefundReceiptCreditRecord[]

// The seed's payout (plan decision "Seed pick"): the payout row above names credit memo
// 1001 of Harborview, which p2-credit-memo seeds and this seed must not touch. So the seed
// posts a credit memo of its own, of a customer no seeded credit memo names, and pays out
// part of it. Seed-only: the reference does not show these rows.
const SEED_MEMO_ID = 'crmpseedaspen01'

// Three access points, taxable, Denver combined: 56 700 + (1 644 + 567 + 2 727) = 61 638.
export const REFUND_SEED_CREDIT_MEMO_LINES = [
    {
        id: 'crmlseedasp0000',
        credit_memo: SEED_MEMO_ID,
        kind: 'item',
        product: PRODUCT_IDS.accessPoint,
        description: 'Wi-Fi 6E ceiling-mount access point, returned unopened.',
        quantity: 3,
        rate: 18_900,
        percent_ppm: 0,
        amount: 56_700,
        taxable: true,
        position: 0,
        created: STAMP,
        updated: STAMP,
    },
] satisfies BooksCreditMemoLines[]

// One of the three access points, paid back by bank transfer from 1000 Business
// Checking: 18 900 + (548 + 189 + 909) = 20 546.
export const REFUND_SEED_PAYOUT_LINES = lines(SEED_PAYOUT_ID, 'spay', [
    {
        kind: 'item',
        product: PRODUCT_IDS.accessPoint,
        description: 'Wi-Fi 6E ceiling-mount access point: part of the credit, paid back.',
        quantity: 1,
        rate: 18_900,
        amount: 18_900,
        taxable: true,
    },
]) satisfies RefundReceiptLineRecord[]

export const REFUND_SEED_PAYOUT = refund({
    id: SEED_PAYOUT_ID,
    customer: ASPEN_RIDGE,
    status: 'posted',
    date: '2026-11-17',
    tax_rate: TAX_IDS.denverCombined,
    payment_method: 'bank_transfer',
    refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
    credit_memo: SEED_MEMO_ID,
    memo: 'Aspen Ridge asked for part of the access point credit back by transfer',
    subtotal: 18_900,
    tax_total: 1_646,
    total: 20_546,
}) satisfies RefundReceiptRecord

const SEED_MEMO_CUSTOMER = CUSTOMERS.find(row => row.id === ASPEN_RIDGE)
if (!SEED_MEMO_CUSTOMER)
    throw new Error('refund receipt fixture: the seed memo customer is missing')

// Posted, dated 2026-11-16, no invoice link. `balance` is what the server leaves after the
// seed payout: the total less the payout.
export const REFUND_SEED_CREDIT_MEMO = {
    id: SEED_MEMO_ID,
    customer: ASPEN_RIDGE,
    status: 'posted',
    number: '',
    sequence: 0,
    date: '2026-11-16',
    bill_to: SEED_MEMO_CUSTOMER.billing_address,
    email: SEED_MEMO_CUSTOMER.email,
    tax_rate: TAX_IDS.denverCombined,
    message: '',
    memo: 'Three access points came back unopened',
    subtotal: 56_700,
    tax_total: 4_938,
    total: 61_638,
    balance: 61_638 - REFUND_SEED_PAYOUT.total,
    applied: 0,
    revision: 1,
    currency: REFUND_RECEIPT_CURRENCY,
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
} satisfies BooksCreditMemos

// What a refund's link row reads from its source (spec §3.2, §3.3, §3.8): the number,
// whether the source is void now, and for a credit memo its live unapplied credit.
export type RefundSourceLink = { id: string; number: string; isVoid: boolean }

// Sales receipt 1002 is posted in the sales receipt fixture; this table is its state
// after a later void (Q13: the link stays, with "(void)").
export const REFUND_SALES_RECEIPT_LINKS: Record<string, RefundSourceLink> = {
    [SALES_RECEIPT_IDS.posted]: { id: SALES_RECEIPT_IDS.posted, number: '1004', isVoid: false },
    [SALES_RECEIPT_IDS.correction]: {
        id: SALES_RECEIPT_IDS.correction,
        number: '1002',
        isVoid: true,
    },
    [SALES_RECEIPT_IDS.exempt]: { id: SALES_RECEIPT_IDS.exempt, number: '1003', isVoid: false },
}

export function salesReceiptLinkLabel(link: RefundSourceLink): string {
    const suffix = link.isVoid ? ' (void)' : ''
    return `Refund of sales receipt ${link.number}${suffix}`
}

export function creditMemoLinkLabel(link: RefundSourceLink): string {
    const suffix = link.isVoid ? ' (void)' : ''
    return `Pays out credit memo ${link.number}${suffix}`
}

// What the posted refunds paid out of a credit memo (spec §3.12): the memo's Refunded row.
export function refundedOfCreditMemo(creditMemoId: string): number {
    return REFUND_RECEIPT_CREDITS.filter(row => row.credit_memo === creditMemoId).reduce(
        (sum, row) => sum + row.amount,
        0
    )
}

const PAYOUT_MEMO = CREDIT_MEMOS.find(row => row.id === CREDIT_MEMO_IDS.posted)
if (!PAYOUT_MEMO) throw new Error('refund receipt fixture: the payout credit memo is missing')

// Credit memo 1001 as its read view shows it after payout 1005 (spec §3.12): the stored
// `balance` is the total less the posted payouts (134 677 - 41 092 = 93 585).
export const PAID_OUT_CREDIT_MEMO: CreditMemoRecord = {
    ...PAYOUT_MEMO,
    balance: PAYOUT_MEMO.total - refundedOfCreditMemo(PAYOUT_MEMO.id),
}
export const PAID_OUT_CREDIT_MEMO_LINES = CREDIT_MEMO_LINES.filter(
    line => line.credit_memo === PAYOUT_MEMO.id
)

export const REFUND_CREDIT_MEMO_LINK: RefundSourceLink = {
    id: PAYOUT_MEMO.id,
    number: PAYOUT_MEMO.number,
    isVoid: false,
}

// The sections of the two source read views (spec §3.11, §3.12): the refund receipts that
// name the record and are not a replaced original, oldest first.
function listed(rows: RefundReceiptRecord[]): RefundReceiptRecord[] {
    return rows.filter(row => row.replaced_by === '').sort((a, b) => a.date.localeCompare(b.date))
}

export function refundReceiptsOfSalesReceipt(salesReceiptId: string): RefundReceiptRecord[] {
    return listed(REFUND_RECEIPTS.filter(row => row.sales_receipt === salesReceiptId))
}

export function refundReceiptsOfCreditMemo(creditMemoId: string): RefundReceiptRecord[] {
    return listed(REFUND_RECEIPTS.filter(row => row.credit_memo === creditMemoId))
}

// "Refund" on sales receipt 1004 (spec §3.2, Q5): the new form starts with the receipt's
// customer, Bill to, Email, Tax, payment method, deposit account (while active) and a
// copy of every line; today's date, no reference no., an empty message and memo.
const SOURCE_RECEIPT = SALES_RECEIPTS.find(row => row.id === SALES_RECEIPT_IDS.posted)
if (!SOURCE_RECEIPT) throw new Error('refund receipt fixture: the source sales receipt is missing')

export const REFUND_FROM_SALES_RECEIPT = refund({
    id: '',
    customer: SOURCE_RECEIPT.customer,
    status: 'draft',
    date: REFUND_RECEIPT_TODAY,
    bill_to: SOURCE_RECEIPT.bill_to,
    email: SOURCE_RECEIPT.email,
    tax_rate: SOURCE_RECEIPT.tax_rate,
    payment_method: SOURCE_RECEIPT.payment_method,
    refund_from: SOURCE_RECEIPT.deposit_to,
    sales_receipt: SOURCE_RECEIPT.id,
    subtotal: SOURCE_RECEIPT.subtotal,
    tax_total: SOURCE_RECEIPT.tax_total,
    total: SOURCE_RECEIPT.total,
})

export const REFUND_FROM_SALES_RECEIPT_LINES: RefundReceiptLineRecord[] =
    SALES_RECEIPT_LINES.filter(line => line.sales_receipt === SOURCE_RECEIPT.id).map(
        ({ sales_receipt: _salesReceipt, ...line }) => ({ ...line, refund_receipt: '' })
    )

// "Refund credit" on credit memo 1001 before any payout (spec §3.3): the memo's customer,
// Bill to, Email, Tax and a copy of every line; today's date (the memo's is earlier),
// Refund from by the default rule (the first active bank account), no payment method.
// The copied lines make the whole unapplied credit, $1,346.77; the user removes lines to
// refund a part.
export const REFUND_PAYOUT_START = refund({
    id: '',
    customer: PAYOUT_MEMO.customer,
    status: 'draft',
    date: REFUND_RECEIPT_TODAY,
    bill_to: PAYOUT_MEMO.bill_to,
    email: PAYOUT_MEMO.email,
    tax_rate: PAYOUT_MEMO.tax_rate,
    refund_from: REFUND_FROM_ACCOUNT_IDS.checking,
    credit_memo: PAYOUT_MEMO.id,
    subtotal: PAYOUT_MEMO.subtotal,
    tax_total: PAYOUT_MEMO.tax_total,
    total: PAYOUT_MEMO.total,
})

export const REFUND_PAYOUT_START_LINES: RefundReceiptLineRecord[] = CREDIT_MEMO_LINES.filter(
    line => line.credit_memo === PAYOUT_MEMO.id
).map(({ credit_memo: _creditMemo, ...line }) => ({ ...line, refund_receipt: '' }))

// The unapplied credit a new payout form shows beside its link (spec §3.3): the memo's
// balance before payout 1005.
export const REFUND_PAYOUT_UNAPPLIED = PAYOUT_MEMO.total
// The unapplied credit a second payout form shows, after payout 1005 ($935.85). Its
// copied lines total $1,346.77, so it starts over the cap (REFUND_RECEIPT_REFUSALS.payoutCap)
// until the user removes lines.
export const REFUND_PAYOUT_REMAINING = PAID_OUT_CREDIT_MEMO.balance

// A fixture that names a missing product, tax rate, account or source is a fixture bug.
const KNOWN_PRODUCTS = new Set([...PRODUCTS, ...INVOICE_PRODUCTS].map(row => row.id))
for (const line of [
    ...REFUND_RECEIPT_LINES,
    ...REFUND_FROM_SALES_RECEIPT_LINES,
    ...REFUND_PAYOUT_START_LINES,
    ...REFUND_SEED_PAYOUT_LINES,
    ...REFUND_SEED_CREDIT_MEMO_LINES,
]) {
    if (line.product !== '' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`refund receipt fixture: line ${line.id} names an unknown product`)
    }
}
for (const row of [
    ...REFUND_RECEIPTS,
    REFUND_SEED_PAYOUT,
    REFUND_FROM_SALES_RECEIPT,
    REFUND_PAYOUT_START,
]) {
    const name = row.id || 'a start form'
    if (row.tax_rate !== '' && !TAX_RATE_ROWS.some(rate => rate.id === row.tax_rate)) {
        throw new Error(`refund receipt fixture: ${name} names an unknown tax rate`)
    }
    if (!REFUND_FROM_ACCOUNTS.some(account => account.id === row.refund_from)) {
        throw new Error(`refund receipt fixture: ${name} names an unknown Refund from account`)
    }
    if (row.reference_no.length > 40) {
        throw new Error(`refund receipt fixture: ${name} has a reference over 40 characters`)
    }
    if (row.sales_receipt !== '' && row.credit_memo !== '') {
        throw new Error(`refund receipt fixture: ${name} has two sources`)
    }
    if (row.sales_receipt !== '') {
        const source = SALES_RECEIPTS.find(receipt => receipt.id === row.sales_receipt)
        if (!source || source.customer !== row.customer) {
            throw new Error(`refund receipt fixture: ${name} names a receipt of another customer`)
        }
        if (!REFUND_SALES_RECEIPT_LINKS[row.sales_receipt]) {
            throw new Error(`refund receipt fixture: ${name} has no link view for its receipt`)
        }
    }
    if (row.credit_memo !== '') {
        const source = [...CREDIT_MEMOS, REFUND_SEED_CREDIT_MEMO].find(
            memo => memo.id === row.credit_memo
        )
        if (!source || source.customer !== row.customer) {
            throw new Error(`refund receipt fixture: ${name} names a memo of another customer`)
        }
        // Spec §3.3: a payout is at most the credit and not dated before its memo.
        if (row.total > source.total || row.date < source.date) {
            throw new Error(`refund receipt fixture: ${name} breaks a payout rule`)
        }
    }
}

// What the reference shows for the client rules and the server's refusals (spec §3.2,
// §3.3, §3.6, §3.7, §3.10, §3.11, §3.12).
export const REFUND_RECEIPT_REFUSALS = {
    inactiveCustomer: 'Old Mill Bakery is inactive. Choose an active customer.',
    refundFrom: 'Choose an active bank or Undeposited funds account',
    noRefundFrom: 'Add a bank account or an Undeposited funds account to the chart of accounts',
    zeroTotal:
        'A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft.',
    negativeTotal: 'A refund receipt total cannot be below zero. Use a sales receipt.',
    tooLarge: 'The refund receipt total is more than Books can store.',
    salesReceiptLink: 'Choose a posted sales receipt of this customer.',
    creditMemoLink: 'Choose a posted credit memo of this customer with unapplied credit.',
    payoutCap: 'The refund is more than the unapplied credit of $935.85 on credit memo 1001.',
    payoutDate: "Date the refund on or after the credit memo's date, Nov 10, 2026.",
    inactiveProduct:
        'Line 2: Wireless access point is inactive. Choose an active product or service.',
    noLines: 'Add at least one product or service line',
    noAccess: 'You need bookkeeper access to create refund receipts',
    notFound: 'This refund receipt does not exist',
    cannotEdit: 'This refund receipt cannot be edited',
    cannotRefundReceipt: 'This sales receipt cannot be refunded',
    cannotRefundMemo: 'This credit memo cannot be refunded',
    receiptCustomerLocked:
        'Refund receipts are made from this sales receipt, so its customer cannot change.',
    memoVoid: 'A refund receipt is recorded on this credit memo. Void the refund first.',
    customerOnRefunds:
        'Harborview Hospitality Group is on refund receipts. Make it inactive instead.',
} as const

// The notice under a payout's link row (spec §3.3).
export const REFUND_PAYOUT_NOTICE =
    'This refund pays out a credit. It lowers what Books owes the customer; income and sales tax were lowered by the credit memo.'

export const NO_REFUND_RECEIPTS: RefundReceiptRecord[] = []
