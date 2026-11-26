// Synthetic purchase orders for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. An account
// line's amount is typed; a product line's amount is Qty x Rate rounded half away from
// zero to cents, as the server writes it. A purchase order has no tax, so `subtotal` and
// `total` are both the sum of every line of both tables.
//
// The collections do not exist yet. PurchaseOrderRecord and PurchaseOrderLineRecord are
// LOCAL types that mirror the spec's Data section (§4). The migration checkpoint
// (2100000048) must replace them with the generated `BooksPurchaseOrders` /
// `BooksPurchaseOrderLines` through `satisfies`, so a row that drifts from the schema
// fails tsc.
//
// A line names its account by seed account number (`account_number`), as the bill fixture
// does: the seed maps the number to the created account's id.
//
// `received`, `billed`, `open_quantity` and `open_amount` are what the server writes once
// the linked bills of PURCHASE_ORDER_BILLS are saved and posted (spec §3.8). The fixture
// checks them against those bills at load.

import { BILL_USER_IDS } from './bill-form-fixture'
import { COMPANY_SETTINGS } from './books-settings-fixture'
import { INVOICE_USER_NAMES } from './invoice-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from './products-services-fixture'
import { PURCHASE_ACCOUNT_TYPES } from './purchase-line-columns'
import { SEED_ACCOUNTS } from './seed-accounts'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export const PURCHASE_ORDER_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const PURCHASE_ORDER_TODAY = '2026-11-25'

const STAMP = '2026-11-25 09:00:00.000Z'

export type PurchaseOrderStatus = 'open' | 'closed'
export type PurchaseOrderClosedReason = '' | 'manual' | 'received'
export type PurchaseOrderLineKind = 'account' | 'item'

// Mirrors spec §4 `books_purchase_orders`; the migration checkpoint replaces it.
export type PurchaseOrderRecord = {
    id: string
    vendor: string
    status: PurchaseOrderStatus
    number: string
    sequence: number
    date: string
    mailing_address: (typeof VENDORS)[number]['address']
    email: string
    ship_to: string
    message: string
    memo: string
    subtotal: number
    total: number
    open_amount: number
    currency: string
    closed_reason: PurchaseOrderClosedReason
    closed_by: string
    closed_at: string
    created_by: string
    revision: number
    form: string
    fields: null
    sort_key: string
    created: string
    updated: string
}

// Mirrors spec §4 `books_purchase_order_lines`; the migration checkpoint replaces it.
export type PurchaseOrderLineRecord = {
    id: string
    purchase_order: string
    kind: PurchaseOrderLineKind
    account: string
    product: string
    description: string
    quantity: number
    rate: number
    amount: number
    position: number
    received: number
    billed: number
    open_quantity: number
    open_amount: number
    created: string
    updated: string
}

// `account_number` is a fixture column the seed maps to `account`.
export type PurchaseOrderLineFixtureRecord = Omit<PurchaseOrderLineRecord, 'account'> & {
    account_number: string
}

// The users the read view names in "Created by" and "Closed by" (the invoice fixture's).
export const PURCHASE_ORDER_USER_IDS = BILL_USER_IDS
export const PURCHASE_ORDER_USER_NAMES = INVOICE_USER_NAMES

// The vendors the seeded book holds that no VENDOR_IDS key names.
const NORTHWEST_PAPER = 'vendnwpaper0001'
const HARBOR_FREIGHT = 'vendharborfl001'
const CASCADE_FUEL = 'vendcascadeff01'

export const PURCHASE_ORDER_IDS = {
    // Closed 1001, Summit IT Services: every line received by one posted bill
    // (`closed_reason` received).
    closedReceived: 'po1001summit001',
    // Closed 1002, Cascade Fuel & Fleet: closed by hand with one line partly received.
    closedManual: 'po1002cascade01',
    // Open 1003, Northwest Paper Co.: partly received by one posted bill; three lines are
    // still open ("Received 4 of 10", "Billed $120.00 of $300.00").
    partly: 'po1003nwpaper01',
    // Open 1004, Office Supply World: nothing received; one account line and three
    // product lines, one of them an Inventory item with no Vendor part no.
    open: 'po1004offsup001',
    // Open 1005, Harbor Freight Logistics: nothing received; a draft bill holds 3 of 8.
    draftBill: 'po1005harbor001',
} as const

const IDS = PURCHASE_ORDER_IDS

// The Inventory item of order 1004 (spec §4 seed). The seeded book has no Inventory
// product yet: the seed checkpoint creates this one with the fields the server's product
// guard needs for an Inventory item (asset and cost-of-goods accounts, opening quantity
// 0), after it greps the product, stock and report specs that count the seeded products.
// It has no Vendor part no., so its lines show no second line (spec §3.4).
export const PURCHASE_ORDER_INVENTORY_PRODUCT = {
    id: 'prodlabelprt001',
    type: 'inventory',
    name: 'Thermal label printer',
    vendor_part_no: '',
    purchases: true,
    purchase_description: 'Thermal label printer, 4 x 6 in, USB and Ethernet.',
    cost: 28_900,
} as const

// What the seed and the reference read about a product on a line: the seeded products
// (products-services-fixture) and the Inventory item above.
export type PurchaseOrderProduct = {
    id: string
    type: string
    name: string
    vendor_part_no: string
    purchase_description: string
    cost: number
}

export const PURCHASE_ORDER_PRODUCTS: PurchaseOrderProduct[] = [
    ...PRODUCTS.filter(row => row.purchases && !row.inactive).map(row => ({
        id: row.id,
        type: row.type,
        name: row.name,
        vendor_part_no: row.vendor_part_no,
        purchase_description: row.purchase_description,
        cost: row.cost,
    })),
    PURCHASE_ORDER_INVENTORY_PRODUCT,
]

// A new order's Ship to (spec §3.3): the business name and address of Settings →
// Company, one per line.
export const DEFAULT_SHIP_TO = `${COMPANY_SETTINGS.business_name}\n${COMPANY_SETTINGS.address}`

// At most 500 characters and 5 lines (spec §3.3): a receiving dock with instructions.
export const LONG_SHIP_TO =
    'Hartwell Supply Co., Receiving\nDock 4, rear entrance off Maple Alley\n3540 E Broad St, Suite 210\nMansfield, TX 76063\nDeliveries 7 am to 3 pm, call (817) 555-0170 on arrival'

type OrderSeed = Pick<PurchaseOrderRecord, 'id' | 'vendor' | 'status' | 'number' | 'date'> &
    Partial<PurchaseOrderRecord>

function order(seed: OrderSeed): PurchaseOrderRecord {
    const vendor = VENDORS.find(row => row.id === seed.vendor)
    if (!vendor) throw new Error(`purchase order fixture: ${seed.id} names an unknown vendor`)
    return {
        sequence: Number(seed.number),
        mailing_address: vendor.address,
        email: vendor.email,
        ship_to: DEFAULT_SHIP_TO,
        message: '',
        memo: '',
        subtotal: 0,
        total: 0,
        open_amount: 0,
        currency: PURCHASE_ORDER_CURRENCY,
        closed_reason: '',
        closed_by: '',
        closed_at: '',
        created_by: PURCHASE_ORDER_USER_IDS.ana,
        revision: 1,
        form: '',
        fields: null,
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

// In the order the seed writes them (spec §4 seed): the server numbers them 1001 to 1005.
// A closed order's `open_amount` is 0 (nothing is on order); its lines keep their open
// quantities, which Reopen puts back on order.
export const PURCHASE_ORDERS = [
    order({
        id: IDS.closedReceived,
        vendor: VENDOR_IDS.summit,
        status: 'closed',
        number: '1001',
        date: '2026-10-12',
        memo: 'Backup licences and two access points for the annex',
        subtotal: 72_280,
        total: 72_280,
        closed_reason: 'received',
        closed_at: '2026-10-30 16:20:00.000Z',
        created: '2026-10-12 15:05:00.000Z',
    }),
    order({
        id: IDS.closedManual,
        vendor: CASCADE_FUEL,
        status: 'closed',
        number: '1002',
        date: '2026-10-20',
        message: 'Please ship the remaining cables with the readers.',
        memo: 'Vendor cannot deliver the rest before year end; closed after the call on Nov 12',
        subtotal: 34_400,
        total: 34_400,
        closed_reason: 'manual',
        closed_by: PURCHASE_ORDER_USER_IDS.omar,
        closed_at: '2026-11-12 18:40:00.000Z',
        created_by: PURCHASE_ORDER_USER_IDS.omar,
        created: '2026-10-20 17:30:00.000Z',
    }),
    order({
        id: IDS.partly,
        vendor: NORTHWEST_PAPER,
        status: 'open',
        number: '1003',
        date: '2026-11-03',
        ship_to: LONG_SHIP_TO,
        message: 'Partial shipments are fine. Reference PO 1003 on every packing slip.',
        memo: 'Design seats for the new hires; second shipment expected in December',
        subtotal: 454_420,
        total: 454_420,
        open_amount: 294_700,
        created: '2026-11-03 14:12:00.000Z',
    }),
    order({
        id: IDS.open,
        vendor: VENDOR_IDS.officeSupply,
        status: 'open',
        number: '1004',
        date: '2026-11-06',
        message: 'Deliver to the rear dock. Call before delivery.',
        memo: 'Back-office network refresh, phase 1',
        subtotal: 157_740,
        total: 157_740,
        open_amount: 157_740,
        created: '2026-11-06 16:48:00.000Z',
    }),
    order({
        id: IDS.draftBill,
        vendor: HARBOR_FREIGHT,
        status: 'open',
        number: '1005',
        date: '2026-11-10',
        subtotal: 112_120,
        total: 112_120,
        open_amount: 112_120,
        created_by: PURCHASE_ORDER_USER_IDS.omar,
        created: '2026-11-10 19:02:00.000Z',
    }),
] satisfies PurchaseOrderRecord[]

export const PURCHASE_ORDER_SEED_IDS = PURCHASE_ORDERS.map(row => row.id)

type LineSeed = Pick<PurchaseOrderLineFixtureRecord, 'kind'> &
    Partial<PurchaseOrderLineFixtureRecord>

function lines(orderId: string, tag: string, seeds: LineSeed[]): PurchaseOrderLineFixtureRecord[] {
    return seeds.map((seed, position) => ({
        id: `pol${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        purchase_order: orderId,
        account_number: '',
        product: '',
        description: '',
        quantity: 0,
        rate: 0,
        amount: 0,
        received: 0,
        billed: 0,
        open_quantity: 0,
        open_amount: 0,
        created: STAMP,
        updated: STAMP,
        ...seed,
        position,
    }))
}

// At most 4000 characters (spec §4), long enough to wrap to the three-line cap.
export const LONG_ORDER_LINE_DESCRIPTION =
    'Annual design suite seat, reseller price. Ten seats for the studio team; the vendor ships the licence keys in two batches, four now and six when the December hires start, and each batch is billed when its keys arrive.'

// Positions run per order across both tables; each table keeps its own order by position.
export const PURCHASE_ORDER_LINES = [
    // 48 000 + 24 280 = 72 280, all on bill 1009.
    ...lines(IDS.closedReceived, '1001', [
        {
            kind: 'account',
            account_number: '6200',
            description: 'Managed backup licences, annual, 14 seats',
            amount: 48_000,
            billed: 48_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 2,
            rate: 12_140,
            amount: 24_280,
            received: 2,
            billed: 24_280,
        },
    ]),
    // 22 000 + 12 400 = 34 400; 15 of 40 cables received (4 650) before the close.
    ...lines(IDS.closedManual, '1002', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Fleet card readers, installation',
            amount: 22_000,
            open_amount: 22_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 40,
            rate: 310,
            amount: 12_400,
            received: 15,
            billed: 4_650,
            open_quantity: 25,
            open_amount: 7_750,
        },
    ]),
    // 30 000 + 360 000 + 3 720 + 60 700 = 454 420; bill 1012 took 12 000 + 144 000 +
    // 3 720 = 159 720; open 18 000 + 216 000 + 60 700 = 294 700.
    ...lines(IDS.partly, '1003', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Freight and handling',
            amount: 30_000,
            billed: 12_000,
            open_amount: 18_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.designLicense,
            description: LONG_ORDER_LINE_DESCRIPTION,
            quantity: 10,
            rate: 36_000,
            amount: 360_000,
            received: 4,
            billed: 144_000,
            open_quantity: 6,
            open_amount: 216_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 12,
            rate: 310,
            amount: 3_720,
            received: 12,
            billed: 3_720,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 5,
            rate: 12_140,
            amount: 60_700,
            open_quantity: 5,
            open_amount: 60_700,
        },
    ]),
    // 4 500 + 72 840 + 22 620 + 57 780 = 157 740; nothing received.
    ...lines(IDS.open, '1004', [
        {
            kind: 'account',
            account_number: '6210',
            description: 'Delivery and setup, back office',
            amount: 4_500,
            open_amount: 4_500,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 6,
            rate: 12_140,
            amount: 72_840,
            open_quantity: 6,
            open_amount: 72_840,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.patchCable,
            description: 'Cat6 patch cable, 10 ft',
            quantity: 72.5,
            rate: 312,
            amount: 22_620,
            open_quantity: 72.5,
            open_amount: 22_620,
        },
        {
            kind: 'item',
            product: PURCHASE_ORDER_INVENTORY_PRODUCT.id,
            description: PURCHASE_ORDER_INVENTORY_PRODUCT.purchase_description,
            quantity: 2,
            rate: 28_890,
            amount: 57_780,
            open_quantity: 2,
            open_amount: 57_780,
        },
    ]),
    // 15 000 + 97 120 = 112 120; a draft bill holds 3 of the 8 access points.
    ...lines(IDS.draftBill, '1005', [
        {
            kind: 'account',
            account_number: '6100',
            description: 'Pallet storage, November',
            amount: 15_000,
            open_amount: 15_000,
        },
        {
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 8,
            rate: 12_140,
            amount: 97_120,
            open_quantity: 8,
            open_amount: 97_120,
        },
    ]),
] satisfies PurchaseOrderLineFixtureRecord[]

// One bill made from an order (spec §3.8): its lines name order lines (`po_line`) with the
// quantity (product line) or amount (account line) the bill takes. The seed saves each
// bill through the bill's own save with `purchase_order` and `po_line`, then posts the
// posted ones; the server gives the numbers, so `number` is what the reference shows, not
// a value to assert. Posted bills use Non-inventory products only and are dated after
// mid-2026 (spec §4 seed).
export type PurchaseOrderBill = {
    id: string
    purchase_order: string
    status: 'draft' | 'posted'
    number: string
    date: string
    lines: { po_line: string; quantity: number; amount: number }[]
}

function lineId(orderId: string, position: number): string {
    const line = PURCHASE_ORDER_LINES.find(
        row => row.purchase_order === orderId && row.position === position
    )
    if (!line) throw new Error(`purchase order fixture: ${orderId} has no line ${position}`)
    return line.id
}

export const PURCHASE_ORDER_BILLS: PurchaseOrderBill[] = [
    {
        id: 'billpo100100001',
        purchase_order: IDS.closedReceived,
        status: 'posted',
        number: '1009',
        date: '2026-10-30',
        lines: [
            { po_line: lineId(IDS.closedReceived, 0), quantity: 0, amount: 48_000 },
            { po_line: lineId(IDS.closedReceived, 1), quantity: 2, amount: 24_280 },
        ],
    },
    {
        id: 'billpo100200001',
        purchase_order: IDS.closedManual,
        status: 'posted',
        number: '1010',
        date: '2026-11-02',
        lines: [{ po_line: lineId(IDS.closedManual, 1), quantity: 15, amount: 4_650 }],
    },
    {
        id: 'billpo100300001',
        purchase_order: IDS.partly,
        status: 'posted',
        number: '1012',
        date: '2026-11-14',
        lines: [
            { po_line: lineId(IDS.partly, 0), quantity: 0, amount: 12_000 },
            { po_line: lineId(IDS.partly, 1), quantity: 4, amount: 144_000 },
            { po_line: lineId(IDS.partly, 2), quantity: 12, amount: 3_720 },
        ],
    },
    {
        id: 'billpo100500001',
        purchase_order: IDS.draftBill,
        status: 'draft',
        number: '',
        date: '2026-11-21',
        lines: [{ po_line: lineId(IDS.draftBill, 1), quantity: 3, amount: 36_420 }],
    },
]

// What the Copy to bill dialog starts with for each open line of an order (spec §3.7): the
// open quantity or amount less what draft bills hold, not below 0.
export function draftHeld(lineIdOf: string): { quantity: number; amount: number } {
    return PURCHASE_ORDER_BILLS.filter(bill => bill.status === 'draft')
        .flatMap(bill => bill.lines)
        .filter(line => line.po_line === lineIdOf)
        .reduce(
            (held, line) => ({
                quantity: held.quantity + line.quantity,
                amount: held.amount + line.amount,
            }),
            { quantity: 0, amount: 0 }
        )
}

// What the reference shows for the refusals and notices (spec §3.5 to §3.8, §3.12).
export const PURCHASE_ORDER_TEXTS = {
    noLines: 'Add at least one account or product line',
    belowReceived: 'Product line 1: 4 are received. The quantity cannot be below 4.',
    belowBilled: 'Account line 1: $120.00 is billed. The amount cannot be below $120.00.',
    lineOnBill: 'Product line 1 is on bill 1012 and cannot be removed.',
    vendorLocked: 'Bills are made from this purchase order, so its vendor cannot change.',
    deleteConfirm: 'Delete purchase order 1004? This can’t be undone.',
    deleteRefused: 'Purchase order 1003 has bills. Close it instead.',
    closedNoEdit: 'A closed purchase order cannot be edited.',
    notFound: 'This purchase order does not exist',
    noAccess: 'You need bookkeeper access to create purchase orders',
    nothingLeft: 'This purchase order has nothing left to copy to a bill.',
    closedByHand: 'Purchase order 1002 is closed. Reopen it to copy it to a bill.',
    chooseLine: 'Choose at least one line.',
    empty: 'No purchase orders yet',
    reportEmpty: 'No open purchase orders',
} as const

export const NO_PURCHASE_ORDERS: PurchaseOrderRecord[] = []

// A fixture that names a missing vendor, product or account, an account the Account picker
// does not list, or numbers that do not add up, is a fixture bug, not data.
const KNOWN_PRODUCTS = new Set(PURCHASE_ORDER_PRODUCTS.map(row => row.id))
const ORDER_ACCOUNT_NUMBERS = new Set(
    SEED_ACCOUNTS.filter(account => PURCHASE_ACCOUNT_TYPES.has(account.type)).map(
        account => account.number
    )
)
const POSTED_BILL_LINES = PURCHASE_ORDER_BILLS.filter(bill => bill.status === 'posted').flatMap(
    bill => bill.lines
)
for (const line of PURCHASE_ORDER_LINES) {
    if (line.kind === 'item' && !KNOWN_PRODUCTS.has(line.product)) {
        throw new Error(`purchase order fixture: line ${line.id} names an unknown product`)
    }
    if (line.kind === 'account' && !ORDER_ACCOUNT_NUMBERS.has(line.account_number)) {
        throw new Error(
            `purchase order fixture: line ${line.id} names ${line.account_number}, not an expense account`
        )
    }
    if (line.kind === 'item' && Math.round(line.quantity * line.rate) !== line.amount) {
        throw new Error(`purchase order fixture: line ${line.id} amount is not Qty x Rate`)
    }
    const taken = POSTED_BILL_LINES.filter(row => row.po_line === line.id)
    const received = taken.reduce((sum, row) => sum + row.quantity, 0)
    const billed = taken.reduce((sum, row) => sum + row.amount, 0)
    if (received !== line.received || billed !== line.billed) {
        throw new Error(`purchase order fixture: line ${line.id} does not match its posted bills`)
    }
    const openQuantity = line.kind === 'item' ? Math.max(line.quantity - line.received, 0) : 0
    const openAmount = Math.max(line.amount - line.billed, 0)
    if (openQuantity !== line.open_quantity || openAmount !== line.open_amount) {
        throw new Error(`purchase order fixture: line ${line.id} open values do not add up`)
    }
}
for (const row of PURCHASE_ORDERS) {
    const own = PURCHASE_ORDER_LINES.filter(line => line.purchase_order === row.id)
    const total = own.reduce((sum, line) => sum + line.amount, 0)
    const open = own.reduce((sum, line) => sum + line.open_amount, 0)
    if (total !== row.total || row.subtotal !== row.total) {
        throw new Error(`purchase order fixture: ${row.id} total does not match its lines`)
    }
    const expectedOpen = row.status === 'open' ? open : 0
    if (expectedOpen !== row.open_amount) {
        throw new Error(`purchase order fixture: ${row.id} open amount does not match its lines`)
    }
    const isReceived = row.closed_reason === 'received'
    if (isReceived && open !== 0) {
        throw new Error(`purchase order fixture: ${row.id} is closed as received with open lines`)
    }
}
