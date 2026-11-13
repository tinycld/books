// Synthetic bills for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. An account
// line's amount is typed (may be negative, never 0); a product line's amount is
// Qty x Rate rounded half away from zero to cents, as the server writes it. A bill has no
// tax, so `subtotal` and `total` are both the sum of every line of both tables.
//
// BillRecord and BillLineRecord mirror spec §4 (books_bills, books_bill_lines) because the
// collections do not exist yet. The migration checkpoint (2100000013_create_books_bills.js)
// must replace both with the generated `BooksBills` / `BooksBillLines` from '../types'
// through `satisfies`, so a row that drifts from the schema fails tsc.
//
// A line names its account by seed account number (`account_number`), as the vendor
// fixture names a default expense account: the relation id is known only after the seed
// creates the accounts. The seed maps the number to the created account's id.

import type { CustomerAddress } from './address'
import { INVOICE_USER_IDS } from './invoice-form-fixture'
import type { PaymentTermKey } from './payment-terms'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { SEED_ACCOUNTS } from './seed-accounts'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export const BILL_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const BILL_TODAY = '2026-11-13'

const STAMP = '2026-11-13 09:00:00.000Z'

export type BillStatus = 'draft' | 'posted' | 'void'
export type BillLineKind = 'account' | 'item'
// Settings → Purchases → Bills → "Bill lines" (books_settings.purchase_lines, spec §3.11).
export type PurchaseLines = 'both' | 'accounts' | 'products'

// Spec §4 books_bills. Replace with the generated BooksBills (migration checkpoint).
export interface BillRecord {
    id: string
    vendor: string
    status: BillStatus
    number: string
    sequence: number
    date: string
    due_date: string
    terms: PaymentTermKey | ''
    mailing_address: CustomerAddress | null
    ref_no: string
    memo: string
    subtotal: number
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
    sort_key: string
    created: string
    updated: string
}

// Spec §4 books_bill_lines. Replace with the generated BooksBillLines (migration
// checkpoint); `account_number` stays a fixture column the seed maps to `account`.
export interface BillLineRecord {
    id: string
    bill: string
    kind: BillLineKind
    account: string
    product: string
    description: string
    quantity: number
    rate: number
    amount: number
    position: number
    created: string
    updated: string
}

export type BillLineFixtureRecord = Omit<BillLineRecord, 'account'> & { account_number: string }

// The users the read view names in "Posted by" and "Voided by" (the invoice fixture's).
export const BILL_USER_IDS = INVOICE_USER_IDS

export const BILL_IDS = {
    // Draft, Pacific Power (no address, Due on receipt), one account line on 6900 Old
    // Petty Cash, which is inactive: the draft saves, Post refuses the line (spec §3.6).
    draft: 'billdraftpacpw1',
    // Posted 1002, Office Supply World: two account lines (one negative, a returned
    // item) and three product lines, one with a long description.
    posted: 'bill1002offsup1',
    // Posted 1003, Summit IT Services: one account line, no product line.
    summit: 'bill1003summit1',
    // Void 1001, Metro Commercial Properties: October rent entered twice.
    voided: 'bill1001metro01',
} as const

const IDS = BILL_IDS

// The vendors the seeded book holds that no VENDOR_IDS key names.
const METRO_PROPERTIES = 'vendmetroprop01'

// Account line types the Account picker lists and the server accepts (spec §3.4).
export const BILL_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
    'expense',
    'other_expense',
    'cost_of_goods_sold',
])

type BillSeed = Pick<BillRecord, 'id' | 'vendor' | 'status' | 'date' | 'due_date'> &
    Partial<BillRecord>

function bill(seed: BillSeed): BillRecord {
    const vendor = VENDORS.find(row => row.id === seed.vendor)
    if (!vendor) throw new Error(`bill fixture: ${seed.id} names an unknown vendor`)
    return {
        number: '',
        sequence: 0,
        terms: vendor.terms,
        mailing_address: vendor.address,
        ref_no: '',
        memo: '',
        subtotal: 0,
        total: 0,
        currency: BILL_CURRENCY,
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

export const BILLS = [
    bill({
        id: IDS.draft,
        vendor: VENDOR_IDS.pacificPower,
        status: 'draft',
        date: BILL_TODAY,
        due_date: BILL_TODAY,
        terms: 'due_on_receipt',
        ref_no: '88412',
        memo: 'November electricity, main office',
        subtotal: 41_286,
        total: 41_286,
    }),
    bill({
        id: IDS.posted,
        vendor: VENDOR_IDS.officeSupply,
        status: 'posted',
        number: '1002',
        sequence: 1002,
        date: '2026-10-16',
        due_date: '2026-10-31',
        terms: 'net_15',
        ref_no: 'OSW-INV-558213',
        memo: 'Q4 supplies and the back-office access points',
        subtotal: 90_995,
        total: 90_995,
        entry: 'jebill100200001',
        posted_by: BILL_USER_IDS.ana,
        posted_at: '2026-10-16 17:42:00.000Z',
    }),
    bill({
        id: IDS.summit,
        vendor: VENDOR_IDS.summit,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-10-28',
        due_date: '2026-11-27',
        terms: 'net_30',
        ref_no: 'SUM-10-2291',
        memo: 'October managed services',
        subtotal: 128_000,
        total: 128_000,
        entry: 'jebill100300001',
        posted_by: BILL_USER_IDS.omar,
        posted_at: '2026-10-29 15:10:00.000Z',
    }),
    bill({
        id: IDS.voided,
        vendor: METRO_PROPERTIES,
        status: 'void',
        number: '1001',
        sequence: 1001,
        date: '2026-10-01',
        due_date: '2026-10-01',
        terms: 'due_on_receipt',
        ref_no: 'MCP-2026-10-210',
        memo: 'October rent, suite 210 (entered twice)',
        subtotal: 325_000,
        total: 325_000,
        entry: 'jebill100100001',
        posted_by: BILL_USER_IDS.ana,
        posted_at: '2026-10-01 16:00:00.000Z',
        voided_by: BILL_USER_IDS.omar,
        voided_at: '2026-10-03 09:25:00.000Z',
    }),
] satisfies BillRecord[]

// The bills the seed writes (spec §4 seed), in this order: posting numbers them 1001,
// 1002, 1003 in the seeded book; the void one is posted, then voided. The draft is saved
// last and never posted.
export const BILL_SEED_IDS = [IDS.voided, IDS.posted, IDS.summit, IDS.draft] as const

type LineSeed = Pick<BillLineFixtureRecord, 'kind'> & Partial<BillLineFixtureRecord>

function lines(billId: string, tag: string, seeds: LineSeed[]): BillLineFixtureRecord[] {
    return seeds.map((seed, position) => ({
        id: `bill${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        bill: billId,
        account_number: '',
        product: '',
        description: '',
        quantity: 0,
        rate: 0,
        amount: 0,
        created: STAMP,
        updated: STAMP,
        ...seed,
        position,
    }))
}

// At most 4000 characters (spec §3.4), long enough to wrap to the three-line cap.
export const LONG_LINE_DESCRIPTION =
    'Annual design suite seat, reseller price. Renews on October 16, 2027; the license key is in the vendor portal under the back-office account, and the seat may move between machines twice a year.'

// Positions run per bill across both tables; each table keeps its own order by position.
export const BILL_LINES = [
    ...lines(IDS.draft, 'drft', [
        {
            kind: 'account',
            account_number: '6900',
            description: 'Electricity, meter 4471, October 9 to November 8',
            amount: 41_286,
        },
    ]),
    // Account lines 18 745 - 3 890 = 14 855; product lines 36 420 + 3 720 + 36 000 =
    // 76 140; total 90 995.
    ...lines(IDS.posted, '1002', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Toner, paper and desk supplies for the quarter',
            amount: 18_745,
        },
        {
            kind: 'account',
            account_number: '6210',
            description: 'Credit for two damaged toner cartridges, returned',
            amount: -3_890,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 3,
            rate: 12_140,
            amount: 36_420,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 12,
            rate: 310,
            amount: 3_720,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.designLicense,
            description: LONG_LINE_DESCRIPTION,
            quantity: 1,
            rate: 36_000,
            amount: 36_000,
        },
    ]),
    ...lines(IDS.summit, '1003', [
        {
            kind: 'account',
            account_number: '6200',
            description:
                'Managed IT services, October: monitoring, patching and help desk for 14 seats',
            amount: 128_000,
        },
    ]),
    ...lines(IDS.voided, '1001', [
        {
            kind: 'account',
            account_number: '6100',
            description: 'Rent, suite 210, October',
            amount: 325_000,
        },
    ]),
] satisfies BillLineFixtureRecord[]

// What a new bill's form shows for each Bill lines setting (spec §3.4): Both — one empty
// account line and an empty product table; Accounts — one empty account line; Products —
// one empty product line.
export const NEW_BILL_LINES: Record<PurchaseLines, { account: number; item: number }> = {
    both: { account: 1, item: 0 },
    accounts: { account: 1, item: 0 },
    products: { account: 0, item: 1 },
}

// Settings → Purchases → Bills (spec §3.11). The seeded books_settings row holds `both`.
export const PURCHASE_LINES_DEFAULT: PurchaseLines = 'both'
export const PURCHASE_LINES_LABELS: Record<PurchaseLines, string> = {
    both: 'Accounts and products',
    accounts: 'Accounts only',
    products: 'Products only',
}

// What the reference shows for the server's refusals (spec §3.5, §3.6).
export const BILL_REFUSALS = {
    duplicateRef: 'Pacific Power already has bill no. 88412 (Bill 1003).',
    inactiveAccount: 'Account line 1: Old Petty Cash is inactive. Choose an active account.',
    notExpenseAccount:
        'Account line 2: Office Equipment is not an expense account. Choose an expense or cost of goods account.',
    notPurchased:
        'Product line 1: Printer paper, case is not purchased. Turn on “I purchase this” for it first.',
    inactiveVendor: 'Pacific Power is inactive. Choose an active vendor.',
    closeDate:
        'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-12.',
    belowZero: 'A bill total cannot be below zero. Use a vendor credit.',
    zeroTotal: 'A bill total must be more than zero to post.',
    tooManyLines: 'A bill holds at most 250 lines.',
    noLines: {
        both: 'Add at least one account or product line',
        accounts: 'Add at least one account line',
        products: 'Add at least one product line',
    } satisfies Record<PurchaseLines, string>,
} as const

export const NO_BILLS: BillRecord[] = []

// A fixture that names a missing vendor, product or account, or an account the bill's
// Account picker does not list, is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set(PRODUCTS.map(row => row.id))
const BILL_ACCOUNT_NUMBERS = new Set(
    SEED_ACCOUNTS.filter(account => BILL_ACCOUNT_TYPES.has(account.type)).map(
        account => account.number
    )
)
for (const line of BILL_LINES) {
    if (!BILLS.some(row => row.id === line.bill)) {
        throw new Error(`bill fixture: line ${line.id} names an unknown bill`)
    }
    if (line.kind === 'item' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`bill fixture: line ${line.id} names an unknown product`)
    }
    if (line.kind === 'account' && !BILL_ACCOUNT_NUMBERS.has(line.account_number)) {
        throw new Error(
            `bill fixture: line ${line.id} names ${line.account_number}, not a bill account`
        )
    }
}
for (const row of BILLS) {
    const sum = BILL_LINES.filter(line => line.bill === row.id).reduce(
        (total, line) => total + line.amount,
        0
    )
    if (sum !== row.total || row.subtotal !== row.total) {
        throw new Error(`bill fixture: ${row.id} total does not match its lines`)
    }
}
