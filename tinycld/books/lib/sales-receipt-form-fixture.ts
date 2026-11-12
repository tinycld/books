// Synthetic sales receipts for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents), as in invoice-form-fixture.ts: `amount`,
// `subtotal`, `tax_total` and `total` are the values the server writes at every save
// (Qty x Rate and Percent x the amount above rounded half away from zero to cents, tax
// `taxOn` per component of the header rate on the taxable total).
//
// SalesReceiptRecord, SalesReceiptLineRecord and SalesReceiptTaxLineRecord are the
// generated types of the collections of 2100000011_create_books_sales_receipts.js, so
// a fixture row that drifts from the schema fails tsc.

import type {
    BooksSalesReceiptLines,
    BooksSalesReceipts,
    BooksSalesReceiptTaxLines,
} from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { DISCOUNT_PRODUCT_ID, INVOICE_PRODUCTS } from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export const SALES_RECEIPT_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const SALES_RECEIPT_TODAY = '2026-11-11'

const STAMP = '2026-11-11 09:00:00.000Z'

// Spec §3.3: "None" is the empty value; the rest are the payment_method select's values.
export type PaymentMethodKey = BooksSalesReceipts['payment_method']

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
    '': 'None',
    cash: 'Cash',
    check: 'Check',
    credit_card: 'Credit card',
    debit_card: 'Debit card',
    bank_transfer: 'Bank transfer',
    other: 'Other',
}

export type SalesReceiptRecord = BooksSalesReceipts
export type SalesReceiptLineRecord = BooksSalesReceiptLines
export type SalesReceiptTaxLineRecord = BooksSalesReceiptTaxLines
export type SalesReceiptStatus = SalesReceiptRecord['status']

// The deposit accounts of the e2e book (lib/seed-accounts.ts; spec §4.6 adds 1200
// Undeposited funds there). The ids are fixture ids: the seed resolves an account by
// its number.
export const DEPOSIT_ACCOUNT_IDS = {
    checking: 'acctfixcheck001',
    savings: 'acctfixsaving01',
    undeposited: 'acctfixundep001',
} as const

export type DepositAccountRow = {
    id: string
    number: string
    name: string
    type: 'bank' | 'other_current_asset'
    detail_type: string
}

// In chart order: every active bank account and the Undeposited funds account.
export const DEPOSIT_ACCOUNTS: DepositAccountRow[] = [
    {
        id: DEPOSIT_ACCOUNT_IDS.checking,
        number: '1000',
        name: 'Business Checking',
        type: 'bank',
        detail_type: 'checking',
    },
    {
        id: DEPOSIT_ACCOUNT_IDS.savings,
        number: '1010',
        name: 'Business Savings',
        type: 'bank',
        detail_type: 'savings',
    },
    {
        id: DEPOSIT_ACCOUNT_IDS.undeposited,
        number: '1200',
        name: 'Undeposited funds',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
    },
]

// A chart with no bank and no Undeposited funds account: Deposit to's inline error.
export const NO_DEPOSIT_ACCOUNTS: DepositAccountRow[] = []

// The users the read view names in "Posted by" and "Voided by".
export const SALES_RECEIPT_USER_IDS = { ana: 'usersrcanaruiz1', omar: 'usersrcomarbel1' } as const
export const SALES_RECEIPT_USER_NAMES: Record<string, string> = {
    [SALES_RECEIPT_USER_IDS.ana]: 'Ana Ruiz',
    [SALES_RECEIPT_USER_IDS.omar]: 'Omar Bell',
}

export const SALES_RECEIPT_IDS = {
    // Posted 1004, Check to 1200 Undeposited funds, every line kind, Denver combined.
    posted: 'srcp1004every01',
    // Posted 1005, no customer, Cash to 1000 Business Checking.
    walkIn: 'srcp1005walkin1',
    // Draft: long customer name, Credit card with a long reference.
    draft: 'srcpdraftstjud1',
    // Void 1002, replaced by its correction (same number).
    voided: 'srcp1002void001',
    correction: 'srcp1002fix0001',
    // Posted 1003 of a tax-exempt customer: every line not taxable, tax $0.00.
    exempt: 'srcp1003exempt1',
} as const

const IDS = SALES_RECEIPT_IDS

// Aspen Ridge Dental: a customer-form fixture row with no CUSTOMER_IDS key.
const ASPEN_RIDGE = 'cust_aspen_0001'

type ReceiptSeed = Pick<SalesReceiptRecord, 'id' | 'status' | 'date' | 'deposit_to'> &
    Partial<SalesReceiptRecord>

function receipt(seed: ReceiptSeed): SalesReceiptRecord {
    const customerId = seed.customer ?? ''
    const customer = CUSTOMERS.find(row => row.id === customerId)
    if (customerId !== '' && !customer) {
        throw new Error(`sales receipt fixture: ${seed.id} names an unknown customer`)
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
        message: '',
        memo: '',
        subtotal: 0,
        tax_total: 0,
        total: 0,
        currency: SALES_RECEIPT_CURRENCY,
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
        ...seed,
    }
}

// The text of the Books setting "Default message to customer" in the reference.
export const DEFAULT_CUSTOMER_MESSAGE =
    'Thank you for your business! Keep this receipt: returns are accepted within 30 days.'

// At most 40 characters (spec §3.3), long enough to fill the cell.
export const LONG_REFERENCE = 'VISA 4417 auth 731042 terminal 2 lane 03'

export const SALES_RECEIPTS = [
    receipt({
        id: IDS.posted,
        customer: CUSTOMER_IDS.harborview,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-03',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '43567',
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        message: DEFAULT_CUSTOMER_MESSAGE,
        memo: 'Paid at the office after the Wi-Fi refresh',
        subtotal: 130_470,
        tax_total: 4_207,
        total: 134_677,
        entry: 'jesalesrc100401',
        posted_by: SALES_RECEIPT_USER_IDS.ana,
        posted_at: '2026-11-03 22:14:00.000Z',
    }),
    receipt({
        id: IDS.walkIn,
        status: 'posted',
        number: '1005',
        sequence: 1005,
        date: '2026-11-05',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'cash',
        deposit_to: DEPOSIT_ACCOUNT_IDS.checking,
        memo: 'Counter sale',
        subtotal: 3_500,
        tax_total: 305,
        total: 3_805,
        entry: 'jesalesrc100501',
        posted_by: SALES_RECEIPT_USER_IDS.omar,
        posted_at: '2026-11-05 17:02:00.000Z',
    }),
    receipt({
        id: IDS.draft,
        customer: CUSTOMER_IDS.stJude,
        status: 'draft',
        date: SALES_RECEIPT_TODAY,
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'credit_card',
        reference_no: LONG_REFERENCE,
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        message: DEFAULT_CUSTOMER_MESSAGE,
        memo: 'Gala setup, paid by the foundation card at pickup',
        subtotal: 181_700,
        tax_total: 4_938,
        total: 186_638,
    }),
    receipt({
        id: IDS.voided,
        customer: ASPEN_RIDGE,
        status: 'void',
        number: '1002',
        sequence: 1002,
        date: '2026-10-09',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '2210',
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        subtotal: 55_200,
        tax_total: 889,
        total: 56_089,
        entry: 'jesalesrc100201',
        replaced_by: IDS.correction,
        posted_by: SALES_RECEIPT_USER_IDS.ana,
        posted_at: '2026-10-09 15:40:00.000Z',
        voided_by: SALES_RECEIPT_USER_IDS.omar,
        voided_at: '2026-10-12 10:05:00.000Z',
    }),
    receipt({
        id: IDS.correction,
        customer: ASPEN_RIDGE,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-10-09',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'check',
        reference_no: '2210',
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        subtotal: 73_600,
        tax_total: 1_184,
        total: 74_784,
        entry: 'jesalesrc100202',
        replaces: IDS.voided,
        posted_by: SALES_RECEIPT_USER_IDS.omar,
        posted_at: '2026-10-12 10:05:00.000Z',
    }),
    receipt({
        id: IDS.exempt,
        customer: CUSTOMER_IDS.northwind,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-14',
        tax_rate: TAX_IDS.denverCombined,
        payment_method: 'debit_card',
        deposit_to: DEPOSIT_ACCOUNT_IDS.checking,
        message: 'Resale certificate CO-98-01234-0000 on file.',
        subtotal: 113_400,
        total: 113_400,
        entry: 'jesalesrc100301',
        posted_by: SALES_RECEIPT_USER_IDS.ana,
        posted_at: '2026-10-14 18:30:00.000Z',
    }),
] satisfies SalesReceiptRecord[]

// The receipts the seed posts, in this order (spec §4.6: Check to 1200 with a customer,
// Cash to 1000 with none), and the draft it keeps.
export const SALES_RECEIPT_SEED_IDS = [IDS.posted, IDS.walkIn] as const
export const SALES_RECEIPT_SEED_DRAFT_ID = IDS.draft

type LineSeed = Pick<SalesReceiptLineRecord, 'kind'> & Partial<SalesReceiptLineRecord>

function lines(receiptId: string, tag: string, seeds: LineSeed[]): SalesReceiptLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `srcl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        sales_receipt: receiptId,
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
export const SALES_RECEIPT_LINES = [
    ...lines(IDS.posted, '1004', [
        {
            kind: 'item',
            product: 'prodbookkeep001',
            description: 'Bookkeeping for October 2026.',
            quantity: 1,
            rate: 50_000,
            amount: 50_000,
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
        { kind: 'subtotal', amount: 98_300 },
        {
            kind: 'percent',
            product: DISCOUNT_PRODUCT_ID,
            description: 'Returning-client discount',
            percent_ppm: -100_000,
            amount: -9_830,
        },
        {
            kind: 'description',
            description: 'Work done at the front office on November 3. Paid in full at pickup.',
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
    ...lines(IDS.walkIn, '1005', [
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 4,
            rate: 875,
            amount: 3_500,
            taxable: true,
        },
    ]),
    // Taxable 56 700: 1 644 + 567 + 2 727 = 4 938.
    ...lines(IDS.draft, 'drft', [
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
            description: 'Wi-Fi 6E ceiling-mount access point, for resale.',
            quantity: 6,
            rate: 18_900,
            amount: 113_400,
        },
    ]),
] satisfies SalesReceiptLineRecord[]

const DENVER_COMPONENTS = [
    { component: TAX_IDS.state, agency: TAX_IDS.colorado, rate_ppm: 29_000 },
    { component: TAX_IDS.rtd, agency: TAX_IDS.colorado, rate_ppm: 10_000 },
    { component: TAX_IDS.denverCity, agency: TAX_IDS.denver, rate_ppm: 48_100 },
] as const

function denverTaxLines(
    receiptId: string,
    tag: string,
    taxable: number,
    amounts: readonly [number, number, number]
): SalesReceiptTaxLineRecord[] {
    return DENVER_COMPONENTS.map((part, position) => ({
        id: `srct${tag}${position}`.padEnd(15, '0'),
        sales_receipt: receiptId,
        rate: TAX_IDS.denverCombined,
        ...part,
        taxable_amount: taxable,
        amount: amounts[position],
        position,
        created: STAMP,
        updated: STAMP,
    }))
}

// The posting snapshot of each posted or void receipt.
export const SALES_RECEIPT_TAX_LINES = [
    ...denverTaxLines(IDS.posted, '1004', 48_300, [1_401, 483, 2_323]),
    ...denverTaxLines(IDS.walkIn, '1005', 3_500, [102, 35, 168]),
    ...denverTaxLines(IDS.voided, '1002', 10_200, [296, 102, 491]),
    ...denverTaxLines(IDS.correction, 'fix2', 13_600, [394, 136, 654]),
    ...denverTaxLines(IDS.exempt, '1003', 0, [0, 0, 0]),
] satisfies SalesReceiptTaxLineRecord[]

// The two Books settings this unit adds (spec §3.11): an empty account is "Ask".
export type SalesSettings = { sales_deposit_account: string; default_customer_message: string }
export const SALES_SETTINGS_ASK: SalesSettings = {
    sales_deposit_account: '',
    default_customer_message: '',
}
export const SALES_SETTINGS_SET: SalesSettings = {
    sales_deposit_account: DEPOSIT_ACCOUNT_IDS.undeposited,
    default_customer_message: DEFAULT_CUSTOMER_MESSAGE,
}

// A fixture that names a missing product, tax rate or account is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set([...PRODUCTS, ...INVOICE_PRODUCTS].map(row => row.id))
for (const line of SALES_RECEIPT_LINES) {
    if (line.product !== '' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`sales receipt fixture: line ${line.id} names an unknown product`)
    }
}
for (const row of SALES_RECEIPTS) {
    if (row.tax_rate !== '' && !TAX_RATE_ROWS.some(rate => rate.id === row.tax_rate)) {
        throw new Error(`sales receipt fixture: ${row.id} names an unknown tax rate`)
    }
    if (!DEPOSIT_ACCOUNTS.some(account => account.id === row.deposit_to)) {
        throw new Error(`sales receipt fixture: ${row.id} names an unknown deposit account`)
    }
    if (row.reference_no.length > 40) {
        throw new Error(`sales receipt fixture: ${row.id} has a reference over 40 characters`)
    }
}

// What the reference shows for the server's refusals.
export const SALES_RECEIPT_REFUSALS = {
    inactiveCustomer: 'Old Mill Bakery is inactive. Choose an active customer.',
    depositAccount: 'Choose an active bank or Undeposited funds account',
    noDepositAccount: 'Add a bank account or an Undeposited funds account to the chart of accounts',
    zeroTotal:
        'A sales receipt with a total of zero cannot be posted. Add an amount or keep it as a draft.',
    inactiveProduct:
        'Line 2: Wireless access point is inactive. Choose an active product or service.',
    noLines: 'Add at least one product or service line',
} as const

export const NO_SALES_RECEIPTS: SalesReceiptRecord[] = []
