// The Open Purchase Orders report (purchase-orders spec §3.10) as static core types: the
// params and the display block as the shipped spec declares them, and run results built
// from the purchase-order fixture's open lines. The helix reference draws it; an e2e
// spec reads its labels and figures.

import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import {
    PURCHASE_ORDER_CURRENCY,
    PURCHASE_ORDER_LINES,
    PURCHASE_ORDER_PRODUCTS,
    PURCHASE_ORDERS,
    type PurchaseOrderLineFixtureRecord,
    type PurchaseOrderRecord,
} from './purchase-orders-fixture'
import { documentKey } from './record-key'
import { SEED_ACCOUNTS } from './seed-accounts'
import { VENDORS } from './vendor-form-fixture'

export const OPEN_PURCHASE_ORDERS_TITLE = 'Open Purchase Orders'
export const OPEN_PURCHASE_ORDERS_DESCRIPTION =
    'What is ordered and not yet received, by vendor and purchase order.'
export const OPEN_PURCHASE_ORDERS_HEADING = 'Harbor Lane Design LLC'
export const OPEN_PURCHASE_ORDERS_EMPTY_TEXT = 'No open purchase orders'

const CURRENCY = PURCHASE_ORDER_CURRENCY

export type OpenOrdersOrder = 'name' | 'open'

// The params as the shipped spec declares them (spec §3.10): Period on the order date
// (All dates by default), Vendor, Order.
export const OPEN_PURCHASE_ORDERS_PARAMS: ParamDef[] = [
    { id: 'period', type: 'dateRange', label: 'Period', default: { preset: 'allDates' } },
    {
        id: 'vendors',
        type: 'choice',
        label: 'Vendor',
        multiple: true,
        header: 'Vendor: {label}',
        optionsFrom: {
            source: 'books.vendors',
            value: [{ field: 'id' }],
            label: [{ field: 'display_name' }],
        },
    },
    {
        id: 'order',
        type: 'choice',
        label: 'Order',
        options: [
            { value: 'name', label: 'Name' },
            { value: 'open', label: 'Largest open amount' },
        ],
        default: 'name',
    },
]

// What the view reads of the spec's groups: Vendor, then Purchase order; both open and
// neither ends in a subtotal row (the group row holds the sums).
export const OPEN_PURCHASE_ORDERS_GROUPS: { subtotals?: boolean; open: boolean }[] = [
    { open: true },
    { open: true },
]

// The display block of the shipped spec, measured in phase 3 pass 2: one line where a row
// is 700 px or wider (a 768 window gives a 704 px row); a narrower row takes three tracks
// on two lines: the label and the open amount, then the three quantities. The open
// amount is on the first line, so every row has a figure there (an account line has no
// quantity). A long label wraps to three lines and a figure is never cut.
export const OPEN_PURCHASE_ORDERS_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '700px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        open_amount: { minWidth: 'max-content' },
    },
    layouts: [
        {
            width: 'mobile',
            tracks: 3,
            cells: [
                { col: 'name', line: 1, span: 2 },
                { col: 'open_amount', line: 1 },
                { col: 'ordered', line: 2 },
                { col: 'received', line: 2 },
                { col: 'open', line: 2 },
            ],
        },
    ],
}

export const OPEN_PURCHASE_ORDERS_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Vendor',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'ordered', label: 'Ordered', type: 'number', aggregate: 'sum' },
    { id: 'received', label: 'Received', type: 'number', aggregate: 'sum' },
    { id: 'open', label: 'Open', type: 'number', aggregate: 'sum' },
    {
        id: 'open_amount',
        label: 'Open amount',
        type: 'money',
        aggregate: 'sum',
        currency: CURRENCY,
    },
]

type Line = PurchaseOrderLineFixtureRecord

// The report's rows: the open lines of the open orders.
function openLinesOf(order: PurchaseOrderRecord): Line[] {
    return PURCHASE_ORDER_LINES.filter(
        line => line.purchase_order === order.id && line.open_amount > 0
    )
}

const OPEN_ORDERS = PURCHASE_ORDERS.filter(
    order => order.status === 'open' && openLinesOf(order).length > 0
)

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)

// Quantities are sums of the product lines; blank where there is none (an account line,
// a group with no product line).
function quantityCells(lines: Line[]) {
    const items = lines.filter(line => line.kind === 'item')
    if (items.length === 0) return { ordered: null, received: null, open: null }
    return {
        ordered: sum(items.map(line => line.quantity)),
        received: sum(items.map(line => line.received)),
        open: sum(items.map(line => line.open_quantity)),
    }
}

function cellsOf(lines: Line[]) {
    return { ...quantityCells(lines), open_amount: sum(lines.map(line => line.open_amount)) }
}

function lineName(line: Line): string {
    if (line.kind === 'item') {
        return PURCHASE_ORDER_PRODUCTS.find(row => row.id === line.product)?.name ?? ''
    }
    const account = SEED_ACCOUNTS.find(row => row.number === line.account_number)
    return account ? `${account.number} ${account.name}` : line.account_number
}

export function openOrderLineLabel(line: Line): string {
    return `${lineName(line)} · ${line.description}`
}

export function openOrderLabel(order: PurchaseOrderRecord): string {
    return `${order.number} · ${order.date}`
}

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

function orderRows(order: PurchaseOrderRecord, vendorRowId: string): ResultRow[] {
    const lines = openLinesOf(order)
    const row: ResultRow = {
        id: groupId([order.vendor, order.id]),
        kind: 'group',
        depth: 1,
        level: 2,
        label: openOrderLabel(order),
        section: vendorRowId,
        groupKey: [order.vendor, order.id, CURRENCY],
        expanded: true,
        canExpand: true,
        cells: cellsOf(lines),
    }
    const details: ResultRow[] = lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 2,
        label: openOrderLineLabel(line),
        section: row.id,
        open: `books/purchase-orders/${documentKey(order)}`,
        cells: cellsOf([line]),
    }))
    return [row, ...details]
}

interface VendorOrders {
    id: string
    name: string
    orders: PurchaseOrderRecord[]
}

function vendorOrders(): VendorOrders[] {
    const ids = [...new Set(OPEN_ORDERS.map(order => order.vendor))]
    return ids.map(id => ({
        id,
        name: VENDORS.find(vendor => vendor.id === id)?.display_name ?? '',
        orders: OPEN_ORDERS.filter(order => order.vendor === id),
    }))
}

const linesOfVendor = (row: VendorOrders) => row.orders.flatMap(openLinesOf)
const openOf = (row: VendorOrders) => sum(linesOfVendor(row).map(line => line.open_amount))

function vendorRows(vendorRow: VendorOrders): ResultRow[] {
    const row: ResultRow = {
        id: groupId([vendorRow.id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label: vendorRow.name,
        groupKey: [vendorRow.id, CURRENCY],
        expanded: true,
        canExpand: true,
        cells: {
            name: vendorRow.id,
            'name@label': vendorRow.name,
            ...cellsOf(linesOfVendor(vendorRow)),
        },
    }
    return [row, ...vendorRow.orders.flatMap(order => orderRows(order, row.id))]
}

interface ResultInput {
    order?: OpenOrdersOrder
    /** Vendor names the Vendor filter keeps. */
    vendors?: string[]
}

function shownVendors(input: ResultInput): VendorOrders[] {
    const picked = input.vendors
    const shown = vendorOrders().filter(row => !picked || picked.includes(row.name))
    const byName = shown.sort((a, b) => a.name.localeCompare(b.name))
    if (input.order !== 'open') return byName
    return byName.sort((a, b) => openOf(b) - openOf(a))
}

function totalRow(shown: VendorOrders[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: {
            ordered: null,
            received: null,
            open: null,
            open_amount: sum(shown.map(openOf)),
        },
    }
}

function resolvedParams(input: ResultInput): ResolvedParam[] {
    const ids = (input.vendors ?? []).map(
        name => VENDORS.find(vendor => vendor.display_name === name)?.id ?? ''
    )
    const vendors: ResolvedParam = input.vendors
        ? { id: 'vendors', type: 'choice', list: ids }
        : { id: 'vendors', type: 'choice', unset: true }
    // All dates is a set range with no bounds, as the server resolves the preset.
    return [
        { id: 'period', type: 'dateRange' },
        vendors,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

function vendorHeader(input: ResultInput): string {
    if (!input.vendors || input.vendors.length === 0) return ''
    return `Vendor: ${input.vendors.join(', ')}`
}

export function openPurchaseOrdersResult(input: ResultInput = {}): RunResult {
    const shown = shownVendors(input)
    return {
        columns: OPEN_PURCHASE_ORDERS_COLUMNS,
        rows: [...shown.flatMap(vendorRows), totalRow(shown)],
        notices: [],
        headerLines: [vendorHeader(input)],
        topics: [
            'collection/books_purchase_order_lines',
            'collection/books_purchase_orders',
            'collection/books_vendors',
            'collection/books_products',
            'collection/books_accounts',
        ],
        heading: OPEN_PURCHASE_ORDERS_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// No open order: only the Total row, so the view is empty.
export function emptyOpenPurchaseOrdersResult(): RunResult {
    return { ...openPurchaseOrdersResult(), rows: [totalRow([])] }
}

// The Vendor filter of the `report-filtered` state: the vendor of the partly received
// order 1003.
export const OPEN_PURCHASE_ORDERS_FILTER_PICK = ['Lumen & Ledger Coworking']
