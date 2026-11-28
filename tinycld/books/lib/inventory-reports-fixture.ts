// Synthetic data of the inventory reports and the Low stock widget for the helix reference
// route, the seed (seed.ts) and tests (inventory-reports spec §4 Seed). Plain data: it
// imports other fixtures and types only, because the seed graph runs in plain node
// (tests/seed-node.test.ts).
//
// It holds the result of the three shipped reports as core's run endpoint sends it
// (Inventory Valuation Summary, Inventory Valuation Detail, Stock Status), their params and
// display blocks, and the rows and models of the Low stock widget (none, 1, 2 and 7 low).
//
// "Bin" is a bin location: a place in the stockroom.
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. The rows
// stand on inventory-adjust-fixture (its items, bins, bin stock and stock moves) plus what
// this unit adds. No migration: every row type is the generated type of its collection.
//
// Three parts need core changes that do not exist yet (checkpoint 0, spec §4 Core). Until
// then the fixture gives what the engine will send:
//   1. `columns[].tone`: STOCK_STATUS_TONES names the cells of a low row; the result
//      carries no tone.
//   2. `columns[].showWhen` / `writeIn`: the Count sheet result leaves the five columns
//      out and has `counted` with a null cell on each row.
//   3. `natural()`: compareNatural below is the order of the Order "Bin".

import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    DrillParams,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksProducts } from '../types'
import {
    BIN_IDS,
    BIN_STOCK,
    BINS,
    type BinRecord,
    type BinStockRecord,
    INVENTORY_CURRENCY,
    INVENTORY_ITEM_IDS,
    INVENTORY_ITEMS,
    INVENTORY_PRINTER,
    INVENTORY_TODAY,
    type InventoryItemRecord,
    NO_BIN,
    NO_BIN_LABEL,
    STOCK_MOVES,
    type StockMoveRecord,
} from './inventory-adjust-fixture'

const CURRENCY = INVENTORY_CURRENCY
const STAMP = '2026-11-27 09:00:00.000Z'

export const INVENTORY_REPORTS_TODAY = INVENTORY_TODAY
export const INVENTORY_REPORTS_HEADING = 'Harbor Lane Design LLC'
// "This month to date" on INVENTORY_REPORTS_TODAY.
export const INVENTORY_REPORTS_PERIOD = { from: '2026-11-01', to: INVENTORY_TODAY } as const

// ---- Bins this unit's seed adds ----

// Two bins whose plain text order and natural order differ: "A-10" is before "A-2" as
// text, and after it in natural order (spec "Natural order", Q23).
export const REPORT_BIN_IDS = {
    a2: 'bina2shelf00001',
    a10: 'bina10shelf0001',
} as const

export const REPORT_BINS_ADDED: BinRecord[] = [
    {
        id: REPORT_BIN_IDS.a2,
        name: 'A-2',
        note: 'Mailers and small boxes.',
        inactive: false,
        created: STAMP,
        updated: STAMP,
    },
    {
        id: REPORT_BIN_IDS.a10,
        name: 'A-10',
        note: '',
        inactive: false,
        created: STAMP,
        updated: STAMP,
    },
]

export const REPORT_BINS: BinRecord[] = [...BINS, ...REPORT_BINS_ADDED]

function binOf(id: string): BinRecord | null {
    if (id === NO_BIN) return null
    const bin = REPORT_BINS.find(row => row.id === id)
    if (!bin) throw new Error(`inventory reports fixture: unknown bin ${id}`)
    return bin
}

// The Bin cell's text (spec §3.4 Columns).
export function reportBinLabel(id: string): string {
    const bin = binOf(id)
    if (!bin) return NO_BIN_LABEL
    return bin.inactive ? `${bin.name} (inactive)` : bin.name
}

// ---- Natural order (core change 3 owns the rule; this is the fixture's copy) ----

const DIGITS_OR_TEXT = /(\d+)|(\D+)/g

// Text compared without regard to case, each run of digits as a number; leading zeros do
// not count, so "A-02" and "A-2" tie.
export function compareNatural(a: string, b: string): number {
    const left = a.toLowerCase().match(DIGITS_OR_TEXT) ?? []
    const right = b.toLowerCase().match(DIGITS_OR_TEXT) ?? []
    for (let k = 0; k < Math.min(left.length, right.length); k++) {
        const x = left[k] ?? ''
        const y = right[k] ?? ''
        const bothNumbers = /^\d/.test(x) && /^\d/.test(y)
        const diff = bothNumbers ? Number(x) - Number(y) : compareText(x, y)
        if (diff !== 0) return diff
    }
    return left.length - right.length
}

// Code unit order, as SQLite's BINARY collation gives for folded text.
function compareText(a: string, b: string): number {
    if (a === b) return 0
    return a < b ? -1 : 1
}

// ---- Items ----

export type ReportItemRecord = InventoryItemRecord & Pick<BooksProducts, 'preferred_vendor'>

// Seeded vendors (vendor-form-fixture), named here because the seed graph keeps this file
// free of that fixture's imports.
export const REPORT_VENDORS = {
    paper: { id: 'vendnwpaper0001', name: 'Northwest Paper Co.' },
    office: { id: 'vendoffsupply01', name: 'Office Supply World' },
    // A name long enough to wrap in the Preferred vendor cell.
    cleaning: {
        id: 'vendwillamett01',
        name: 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative',
    },
} as const

const VENDOR_NAMES: Record<string, string> = Object.fromEntries(
    Object.values(REPORT_VENDORS).map(vendor => [vendor.id, vendor.name])
)

export const REPORT_ITEM_IDS = {
    ...INVENTORY_ITEM_IDS,
    // The low item this unit's seed adds (spec §4 Seed, Q15).
    mailers: 'prodbubblemail1',
    // Reference only: inactive, no code, still in stock, with a revaluation in November.
    oldLabels: 'prodoldlabel001',
} as const

const ITEM = REPORT_ITEM_IDS

// The seed creates it after the last seeded document. Its opening stock lands in its
// default bin, A-10; a move between bins then puts 3 in A-2, so it is in two bins.
export const BUBBLE_MAILERS: ReportItemRecord = {
    id: ITEM.mailers,
    type: 'inventory',
    name: 'Bubble mailers, 6 x 9 in',
    code: 'MAIL-6X9',
    vendor_part_no: 'NWP-BM-69',
    price: 95,
    cost: 240,
    purchases: true,
    purchase_description: 'Kraft bubble mailers, 6 x 9 in, self-seal.',
    reorder_point: 25,
    opening_quantity: 8,
    opening_value: 1_920,
    opening_date: '2026-08-03',
    quantity_on_hand: 8,
    stock_value: 1_920,
    quantity_on_po: 0,
    inactive: false,
    currency: CURRENCY,
    default_bin: REPORT_BIN_IDS.a10,
    low_stock: true,
    preferred_vendor: REPORT_VENDORS.paper.id,
}

// The move between bins the seed writes for the mailers (books_bin_transfers): it changes
// no value.
export const SEED_MAILERS_TRANSFER = {
    product: ITEM.mailers,
    from_bin: REPORT_BIN_IDS.a10,
    to_bin: REPORT_BIN_IDS.a2,
    quantity: 3,
    memo: 'Mailers for the packing table',
} as const

// The seed gives the label printer (no stock) a default bin, so Stock Status lists it at 0
// in that bin (spec §3.4, Q21).
export const SEED_PRINTER_DEFAULT_BIN = REPORT_BIN_IDS.a2

const OLD_LABELS: ReportItemRecord = {
    id: ITEM.oldLabels,
    type: 'inventory',
    name: 'Shipping labels, 2 x 1 in, roll of 1000',
    code: '',
    vendor_part_no: '',
    price: 1_800,
    cost: 200,
    purchases: false,
    purchase_description: '',
    reorder_point: 0,
    opening_quantity: 6,
    opening_value: 1_200,
    opening_date: '2026-07-01',
    quantity_on_hand: 6,
    stock_value: 1_080,
    quantity_on_po: 0,
    inactive: true,
    currency: CURRENCY,
    default_bin: BIN_IDS.backRoom,
    low_stock: false,
    preferred_vendor: '',
}

// The seed writes a preferred vendor on the mailers only; the other vendors here are the
// reference's, so the Vendor column shows a short name, a long name and a blank.
const REFERENCE_VENDORS: Record<string, string> = {
    [ITEM.labels]: REPORT_VENDORS.paper.id,
    [ITEM.paperRoll]: REPORT_VENDORS.paper.id,
    [ITEM.scanner]: REPORT_VENDORS.office.id,
    [ITEM.tape]: REPORT_VENDORS.cleaning.id,
}

function withVendor(item: InventoryItemRecord): ReportItemRecord {
    return { ...item, preferred_vendor: REFERENCE_VENDORS[item.id] ?? '' }
}

const PRINTER: ReportItemRecord = {
    ...withVendor(INVENTORY_PRINTER),
    default_bin: SEED_PRINTER_DEFAULT_BIN,
}

// Every Inventory item of the reference, the one with no stock (the printer) included.
export const REPORT_ITEMS: ReportItemRecord[] = [
    ...INVENTORY_ITEMS.map(withVendor),
    PRINTER,
    BUBBLE_MAILERS,
    OLD_LABELS,
]

function itemOf(id: string): ReportItemRecord {
    const item = REPORT_ITEMS.find(row => row.id === id)
    if (!item) throw new Error(`inventory reports fixture: unknown item ${id}`)
    return item
}

// "<code> · <name>", the name alone with no code; " (inactive)" after an inactive item
// (spec §3.1).
export function reportItemLabel(item: Pick<ReportItemRecord, 'code' | 'name' | 'inactive'>) {
    const label = item.code === '' ? item.name : `${item.code} · ${item.name}`
    return item.inactive ? `${label} (inactive)` : label
}

const byName = (a: ReportItemRecord, b: ReportItemRecord) =>
    compareText(a.name.toLowerCase(), b.name.toLowerCase())

// An item with no code is first under "Item code" (spec §3.4 Order).
const byCode = (a: ReportItemRecord, b: ReportItemRecord) =>
    compareText(a.code.toLowerCase(), b.code.toLowerCase()) || byName(a, b)

// ---- Stock in bins ----

// One row for each item and bin. Books keeps a row at 0 for an Inventory item's default
// bin (spec §4 Server): the printer's row here.
export const REPORT_BIN_STOCK: BinStockRecord[] = [
    ...BIN_STOCK,
    { id: 'bstkmailera1001', product: ITEM.mailers, bin: REPORT_BIN_IDS.a10, quantity: 5 },
    { id: 'bstkmailera2001', product: ITEM.mailers, bin: REPORT_BIN_IDS.a2, quantity: 3 },
    { id: 'bstkprintera201', product: ITEM.printer, bin: REPORT_BIN_IDS.a2, quantity: 0 },
    { id: 'bstkoldlblback1', product: ITEM.oldLabels, bin: BIN_IDS.backRoom, quantity: 6 },
]

for (const item of REPORT_ITEMS) {
    const inBins = REPORT_BIN_STOCK.filter(row => row.product === item.id).reduce(
        (sum, row) => sum + Math.round(row.quantity * 100),
        0
    )
    if (inBins !== Math.round(item.quantity_on_hand * 100)) {
        throw new Error(`inventory reports fixture: the bins of ${item.id} do not add up`)
    }
}

// ---- Stock moves ----

type MoveSeed = Omit<StockMoveRecord, 'quantity_after' | 'value_after' | 'seq'>

function movesOf(seeds: MoveSeed[]): StockMoveRecord[] {
    let quantity = 0
    let value = 0
    return seeds.map((seed, index) => {
        quantity = Math.round((quantity + seed.quantity) * 100) / 100
        value += seed.value
        return { ...seed, seq: index + 1, quantity_after: quantity, value_after: value }
    })
}

// An item's opening move, from its opening stock. `number` is its opening adjustment's.
function openingMove(item: ReportItemRecord, number: string): MoveSeed {
    return {
        id: `smovopen${item.id.slice(4, 11)}`,
        product: item.id,
        date: item.opening_date,
        kind: 'opening',
        source: 'books_inventory_adjustments',
        document: `iadjopen${item.id.slice(4, 11)}`,
        quantity: item.opening_quantity,
        value: item.opening_value,
        bin: item.default_bin,
        document_number: number,
    }
}

// A revaluation: no quantity, a value change only (spec §3.3: Quantity and Unit cost are
// blank on its row). Reference only.
const OLD_LABELS_REVALUATION: MoveSeed = {
    id: 'smovoldlbl00002',
    product: ITEM.oldLabels,
    date: '2026-11-10',
    kind: 'adjustment',
    source: 'books_inventory_adjustments',
    document: 'iadjrevalue0015',
    quantity: 0,
    value: -120,
    bin: NO_BIN,
    document_number: 'IA-7',
}

// inventory-adjust-fixture holds the moves of the labels and the scanner; the other items
// have their opening move only.
export const REPORT_STOCK_MOVES: StockMoveRecord[] = [
    ...STOCK_MOVES,
    ...movesOf([openingMove(itemOf(ITEM.paperRoll), 'IA-2')]),
    ...movesOf([openingMove(itemOf(ITEM.tape), 'IA-3')]),
    ...movesOf([openingMove(BUBBLE_MAILERS, 'IA-6')]),
    ...movesOf([openingMove(OLD_LABELS, 'IA-8'), OLD_LABELS_REVALUATION]),
]

function movesOfItem(product: string): StockMoveRecord[] {
    return REPORT_STOCK_MOVES.filter(row => row.product === product).sort(
        (a, b) => compareText(a.date, b.date) || a.seq - b.seq
    )
}

for (const item of REPORT_ITEMS) {
    const moves = movesOfItem(item.id)
    const last = moves[moves.length - 1]
    const quantity = last?.quantity_after ?? 0
    const value = last?.value_after ?? 0
    if (quantity !== item.quantity_on_hand || value !== item.stock_value) {
        throw new Error(`inventory reports fixture: the moves of ${item.id} do not add up`)
    }
}

const SALE_WORDS: Record<string, string> = {
    books_invoices: 'Invoice',
    books_sales_receipts: 'Sales receipt',
}

// The Transaction text (spec §3.3): the kind's word and the document's number.
export function moveTransaction(move: StockMoveRecord): string {
    switch (move.kind) {
        case 'opening':
            return 'Opening stock'
        case 'receipt':
            return `Bill ${move.document_number}`
        case 'sale':
            return `${SALE_WORDS[move.source] ?? 'Sale'} ${move.document_number}`
        case 'customer_return':
            return `Credit memo ${move.document_number}`
        case 'vendor_return':
            return `Vendor credit ${move.document_number}`
        default:
            return `Inventory adjustment ${move.document_number}`
    }
}

// The route segment of each document kind (server/entry_routes.json).
const MOVE_ROUTES: Record<string, string> = {
    books_invoices: 'invoices',
    books_sales_receipts: 'sales-receipts',
    books_credit_memos: 'credit-memos',
    books_bills: 'bills',
    books_vendor_credits: 'vendor-credits',
    books_inventory_adjustments: 'inventory-adjustments',
}

// The app path a move row opens (spec §3.6).
export function moveOpenPath(move: StockMoveRecord): string {
    return `books/${MOVE_ROUTES[move.source]}/${move.document}`
}

// Value ÷ quantity, both without sign, to whole cents; null on a revaluation.
function unitCost(move: Pick<StockMoveRecord, 'quantity' | 'value'>): number | null {
    if (move.quantity === 0) return null
    return Math.round(Math.abs(move.value) / Math.abs(move.quantity))
}

const blankZero = (value: number): number | null => (value === 0 ? null : value)

const groupId = (item: ReportItemRecord) => `g:${JSON.stringify([item.id])}`

function itemParam(header: string): ParamDef {
    return {
        id: 'items',
        type: 'choice',
        label: 'Item',
        multiple: true,
        header,
        optionsFrom: {
            source: 'books.products',
            value: [{ field: 'id' }],
            label: [{ field: 'name' }],
        },
    }
}

const NAME_AND_CODE = [
    { value: 'name', label: 'Item name' },
    { value: 'code', label: 'Item code' },
]

type Display = NonNullable<ReportSpec['display']>
type SpecGroups = { subtotals?: boolean; open: boolean }[]

const WHOLE_FIGURE = { minWidth: 'max-content' } as const

// ---- Inventory Valuation Summary (spec §3.2) ----

export const VALUATION_SUMMARY_TITLE = 'Inventory Valuation Summary'
export const VALUATION_SUMMARY_DESCRIPTION =
    'Quantity and value of the stock of each item, as of a day.'
export const VALUATION_SUMMARY_EMPTY = 'No stock on this day'
// The id the reference gives the drill target; the build reads the shipped report's.
export const VALUATION_DETAIL_REFERENCE_ID = 'reference-inventory-valuation-detail'

export const VALUATION_SUMMARY_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'today' } },
    itemParam('Item: {label}'),
    {
        id: 'rows',
        type: 'choice',
        label: 'Rows',
        options: [
            { value: 'stock', label: 'With stock' },
            { value: 'all', label: 'All items' },
        ],
        default: 'stock',
    },
    {
        id: 'order',
        type: 'choice',
        label: 'Order',
        options: [...NAME_AND_CODE, { value: 'value', label: 'Largest value' }],
        default: 'name',
    },
]

// One group, the item, closed at the start, with no subtotal row.
export const VALUATION_SUMMARY_GROUPS: SpecGroups = [{ open: false }]

// One line from 640 px; narrower rows take 2 tracks: the label over both, then Quantity
// and Asset value, then Avg cost and % of total.
export const VALUATION_SUMMARY_DISPLAY: Display = {
    oneLine: { minWidth: '640px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3, minWidth: '200px' },
        quantity: WHOLE_FIGURE,
        avg: WHOLE_FIGURE,
        value: WHOLE_FIGURE,
        pct: WHOLE_FIGURE,
    },
    layouts: [
        {
            width: 'mobile',
            tracks: 2,
            cells: [
                { col: 'name', line: 1, span: 2 },
                { col: 'quantity', line: 2 },
                { col: 'value', line: 2 },
                { col: 'avg', line: 3 },
                { col: 'pct', line: 3 },
            ],
        },
    ],
}

export const VALUATION_SUMMARY_COLUMNS: ResultColumn[] = [
    { id: 'name', label: 'Item', type: 'text' },
    { id: 'quantity', label: 'Quantity', type: 'number', aggregate: 'sum', blankAbove: true },
    { id: 'avg', label: 'Avg cost', type: 'money', currency: CURRENCY, blankAbove: true },
    {
        id: 'value',
        label: 'Asset value',
        type: 'money',
        currency: CURRENCY,
        aggregate: 'sum',
        drill: { reportId: VALUATION_DETAIL_REFERENCE_ID, title: 'Inventory Valuation Detail' },
    },
    { id: 'pct', label: '% of total', type: 'percent', scale: 2 },
]

export type SummaryRows = 'stock' | 'all'
export type SummaryOrder = 'name' | 'code' | 'value'

export interface ValuationSummaryInput {
    rows?: SummaryRows
    order?: SummaryOrder
    /** The items whose row is open to its moves. */
    open?: string[]
}

function summaryItems(input: ValuationSummaryInput): ReportItemRecord[] {
    const shown = REPORT_ITEMS.filter(item => {
        if (item.quantity_on_hand !== 0 || item.stock_value !== 0) return true
        return input.rows === 'all' && !item.inactive
    })
    if (input.order === 'code') return shown.sort(byCode)
    if (input.order === 'value') {
        return shown.sort((a, b) => b.stock_value - a.stock_value || byName(a, b))
    }
    return shown.sort(byName)
}

const percentOf = (value: number, total: number) =>
    total === 0 ? null : Math.round((value / total) * 10_000) / 100

// A `@drill` cell is not a CellValue (core types.ts R12): the row carries it as the server
// sends it, and core reads it only through drillCellParams.
function withDrill(cells: Record<string, CellValue>, drill: DrillParams): ResultRow['cells'] {
    const out: Record<string, unknown> = { ...cells, 'value@drill': drill }
    return out as ResultRow['cells']
}

function summaryMoveRow(section: string, move: StockMoveRecord): ResultRow {
    return {
        id: `d:${move.id}`,
        kind: 'detail',
        depth: 1,
        label: `${move.date} · ${moveTransaction(move)}`,
        section,
        open: moveOpenPath(move),
        cells: {
            quantity: blankZero(move.quantity),
            avg: unitCost(move),
            value: move.value,
            pct: null,
        },
    }
}

function summaryRows(item: ReportItemRecord, total: number, isOpen: boolean): ResultRow[] {
    const id = groupId(item)
    const moves = movesOfItem(item.id)
    const quantity = item.quantity_on_hand
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        level: 1,
        label: reportItemLabel(item),
        groupKey: [item.id],
        expanded: isOpen,
        canExpand: true,
        ...(item.inactive ? { muted: true } : {}),
        cells: withDrill(
            {
                quantity,
                avg: quantity > 0 ? Math.round(item.stock_value / quantity) : null,
                value: item.stock_value,
                pct: percentOf(item.stock_value, total),
            },
            {
                items: [item.id],
                period: { from: moves[0]?.date ?? INVENTORY_TODAY, to: INVENTORY_TODAY },
            }
        ),
    }
    if (!isOpen) return [group]
    return [group, ...moves.map(move => summaryMoveRow(id, move))]
}

const VALUATION_TOPICS = ['collection/books_stock_moves', 'collection/books_products']

export function valuationSummaryResult(input: ValuationSummaryInput = {}): RunResult {
    const items = summaryItems(input)
    const total = items.reduce((sum, item) => sum + item.stock_value, 0)
    const open = input.open ?? []
    const totalRow: ResultRow = {
        id: 'total:[]',
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { quantity: null, avg: null, value: total, pct: 100 },
    }
    return {
        columns: VALUATION_SUMMARY_COLUMNS,
        rows: [
            ...items.flatMap(item => summaryRows(item, total, open.includes(item.id))),
            totalRow,
        ],
        notices: [],
        headerLines: [''],
        topics: VALUATION_TOPICS,
        heading: INVENTORY_REPORTS_HEADING,
        page: null,
        params: [
            { id: 'asOf', type: 'asOf', value: INVENTORY_TODAY },
            { id: 'items', type: 'choice', unset: true },
            { id: 'rows', type: 'choice', value: input.rows ?? 'stock' },
            { id: 'order', type: 'choice', value: input.order ?? 'name' },
        ],
    }
}

export function emptyValuationSummaryResult(): RunResult {
    return { ...valuationSummaryResult(), rows: [] }
}

// ---- Inventory Valuation Detail (spec §3.3) ----

export const VALUATION_DETAIL_TITLE = 'Inventory Valuation Detail'
export const VALUATION_DETAIL_DESCRIPTION =
    'Each stock movement of each item in a period, with the quantity and the value after it.'
export const VALUATION_DETAIL_EMPTY = 'No stock movements in this period'

export const VALUATION_DETAIL_PARAMS: ParamDef[] = [
    { id: 'period', type: 'dateRange', label: 'Period', default: { preset: 'thisMonthToDate' } },
    itemParam('Item: {label}'),
    { id: 'order', type: 'choice', label: 'Order', options: NAME_AND_CODE, default: 'name' },
]

// One group, the item, open at the start, with its subtotal row.
export const VALUATION_DETAIL_GROUPS: SpecGroups = [{ open: true, subtotals: true }]

// One line from 860 px. A tablet arrangement from 600 px (12 tracks): the label and
// Transaction, then the five figures. Narrower rows take 6 tracks and three lines.
export const VALUATION_DETAIL_DISPLAY: Display = {
    oneLine: { minWidth: '860px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        transaction: { whiteSpace: 'normal', lineClamp: 2 },
        quantity: WHOLE_FIGURE,
        unit_cost: WHOLE_FIGURE,
        value: WHOLE_FIGURE,
        on_hand: WHOLE_FIGURE,
        asset_value: WHOLE_FIGURE,
    },
    layouts: [
        {
            width: 'tablet',
            minWidth: '600px',
            tracks: 12,
            cells: [
                { col: 'name', line: 1, span: 3 },
                { col: 'transaction', line: 1, span: 9 },
                { col: 'quantity', line: 2, span: 2 },
                { col: 'unit_cost', line: 2, span: 2 },
                { col: 'value', line: 2, span: 3 },
                { col: 'on_hand', line: 2, span: 2 },
                { col: 'asset_value', line: 2, span: 3 },
            ],
        },
        {
            width: 'mobile',
            tracks: 6,
            cells: [
                { col: 'name', line: 1, span: 2 },
                { col: 'transaction', line: 1, span: 4 },
                { col: 'quantity', line: 2, span: 2 },
                { col: 'unit_cost', line: 2, span: 2 },
                { col: 'value', line: 2, span: 2 },
                { col: 'on_hand', line: 3, span: 3 },
                { col: 'asset_value', line: 3, span: 3 },
            ],
        },
    ],
}

export const VALUATION_DETAIL_COLUMNS: ResultColumn[] = [
    { id: 'name', label: 'Item / Date', type: 'text' },
    { id: 'transaction', label: 'Transaction', type: 'text' },
    { id: 'quantity', label: 'Quantity', type: 'number', aggregate: 'sum', blankAbove: true },
    { id: 'unit_cost', label: 'Unit cost', type: 'money', currency: CURRENCY },
    { id: 'value', label: 'Value', type: 'money', currency: CURRENCY, aggregate: 'sum' },
    { id: 'on_hand', label: 'On hand', type: 'number' },
    { id: 'asset_value', label: 'Asset value', type: 'money', currency: CURRENCY },
]

interface DetailSection {
    item: ReportItemRecord
    beginning: { quantity: number; value: number }
    moves: StockMoveRecord[]
    ending: { quantity: number; value: number }
}

function detailSection(item: ReportItemRecord): DetailSection {
    const all = movesOfItem(item.id)
    const before = all.filter(move => move.date < INVENTORY_REPORTS_PERIOD.from)
    const last = before[before.length - 1]
    const beginning = { quantity: last?.quantity_after ?? 0, value: last?.value_after ?? 0 }
    const moves = all.filter(
        move =>
            move.date >= INVENTORY_REPORTS_PERIOD.from && move.date <= INVENTORY_REPORTS_PERIOD.to
    )
    const end = moves[moves.length - 1]
    const ending = end ? { quantity: end.quantity_after, value: end.value_after } : beginning
    return { item, beginning, moves, ending }
}

// A section shows with a move in the period, or a quantity or a value before it.
function isDetailShown(section: DetailSection): boolean {
    const { beginning, moves } = section
    return moves.length > 0 || beginning.quantity !== 0 || beginning.value !== 0
}

function detailMoveRow(section: string, move: StockMoveRecord): ResultRow {
    return {
        id: `d:${move.id}`,
        kind: 'detail',
        depth: 1,
        label: move.date,
        labelType: 'date',
        labelValue: move.date,
        section,
        open: moveOpenPath(move),
        cells: {
            transaction: moveTransaction(move),
            quantity: blankZero(move.quantity),
            unit_cost: unitCost(move),
            value: move.value,
            on_hand: move.quantity_after,
            asset_value: move.value_after,
        },
    }
}

function detailRows(section: DetailSection): ResultRow[] {
    const { item, beginning, moves, ending } = section
    const id = groupId(item)
    const label = reportItemLabel(item)
    const figures = {
        quantity: blankZero(moves.reduce((sum, move) => sum + move.quantity, 0)),
        value: moves.reduce((sum, move) => sum + move.value, 0),
        on_hand: ending.quantity,
        asset_value: ending.value,
    }
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [item.id],
        expanded: true,
        canExpand: true,
        ...(item.inactive ? { muted: true } : {}),
        cells: figures,
    }
    const opening: ResultRow = {
        id: `opening:${JSON.stringify([item.id])}`,
        kind: 'opening',
        depth: 1,
        label: 'Beginning balance',
        section: id,
        groupKey: [item.id],
        cells: { on_hand: beginning.quantity, asset_value: beginning.value },
    }
    const subtotal: ResultRow = {
        id: `s:${JSON.stringify([item.id])}`,
        kind: 'subtotal',
        depth: 0,
        level: 1,
        label: `Total ${label}`,
        section: id,
        cells: figures,
    }
    return [group, opening, ...moves.map(move => detailMoveRow(id, move)), subtotal]
}

export function valuationDetailResult(): RunResult {
    const sections = [...REPORT_ITEMS].sort(byName).map(detailSection).filter(isDetailShown)
    const moves = sections.flatMap(section => section.moves)
    const totalRow: ResultRow = {
        id: 'total:[]',
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: {
            quantity: null,
            unit_cost: null,
            value: moves.reduce((sum, move) => sum + move.value, 0),
            on_hand: null,
            asset_value: sections.reduce((sum, section) => sum + section.ending.value, 0),
        },
    }
    return {
        columns: VALUATION_DETAIL_COLUMNS,
        rows: [...sections.flatMap(detailRows), totalRow],
        notices: [],
        headerLines: [''],
        topics: VALUATION_TOPICS,
        heading: INVENTORY_REPORTS_HEADING,
        page: null,
        params: [
            { id: 'period', type: 'dateRange', ...INVENTORY_REPORTS_PERIOD },
            { id: 'items', type: 'choice', unset: true },
            { id: 'order', type: 'choice', value: 'name' },
        ],
    }
}

export function emptyValuationDetailResult(): RunResult {
    return { ...valuationDetailResult(), rows: [] }
}

// ---- Stock Status (spec §3.4) ----

export const STOCK_STATUS_TITLE = 'Stock Status'
export const STOCK_STATUS_DESCRIPTION =
    'On hand, on purchase order and reorder point of each item, by the bin it is in. Also a count sheet.'
export const STOCK_STATUS_EMPTY = 'No inventory items to show'
export const LOW_STOCK_WORDS = 'Low stock'

export type StockView = 'status' | 'count'
export type StockShow = 'all' | 'low'
export type StockOrder = 'name' | 'code' | 'bin'

export const STOCK_STATUS_PARAMS: ParamDef[] = [
    {
        id: 'view',
        type: 'choice',
        label: 'View',
        options: [
            { value: 'status', label: 'Stock status' },
            { value: 'count', label: 'Count sheet' },
        ],
        default: 'status',
    },
    {
        id: 'show',
        type: 'choice',
        label: 'Show',
        options: [
            { value: 'all', label: 'All items' },
            { value: 'low', label: 'Low stock only' },
        ],
        default: 'all',
    },
    {
        id: 'bins',
        type: 'choice',
        label: 'Bin',
        multiple: true,
        header: 'Bin: {label}',
        optionsFrom: {
            source: 'books.bins',
            value: [{ field: 'id' }],
            label: [{ field: 'name' }],
        },
    },
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
        options: [...NAME_AND_CODE, { value: 'bin', label: 'Bin' }],
        default: 'name',
    },
]

// A flat list: no group.
export const STOCK_STATUS_GROUPS: SpecGroups = []

// One line from 900 px. A tablet arrangement from 560 px (12 tracks). Narrower rows take
// 6 tracks. `counted` (the Count sheet view) has a line of its own after the others in
// each wrapped arrangement, so no line's spans pass its tracks in either view; a line
// whose columns are all out of the result draws nothing (spec §3.4 Display, Count sheet).
export const STOCK_STATUS_DISPLAY: Display = {
    oneLine: { minWidth: '900px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3, minWidth: '200px' },
        bin: { whiteSpace: 'normal', lineClamp: 2 },
        in_bin: WHOLE_FIGURE,
        on_hand: WHOLE_FIGURE,
        on_po: WHOLE_FIGURE,
        reorder_point: WHOLE_FIGURE,
        counted: { minWidth: '120px' },
    },
    layouts: [
        {
            width: 'tablet',
            minWidth: '560px',
            tracks: 12,
            cells: [
                { col: 'name', line: 1, span: 6 },
                { col: 'bin', line: 1, span: 2 },
                { col: 'vendor', line: 1, span: 4 },
                { col: 'in_bin', line: 2, span: 2 },
                { col: 'on_hand', line: 2, span: 2 },
                { col: 'on_po', line: 2, span: 2 },
                { col: 'reorder_point', line: 2, span: 3 },
                { col: 'status', line: 2, span: 3 },
                { col: 'counted', line: 3, span: 4 },
            ],
        },
        {
            width: 'mobile',
            tracks: 6,
            cells: [
                { col: 'name', line: 1, span: 6 },
                { col: 'bin', line: 2, span: 3 },
                { col: 'status', line: 2, span: 3 },
                { col: 'in_bin', line: 3, span: 2 },
                { col: 'on_hand', line: 3, span: 2 },
                { col: 'on_po', line: 3, span: 2 },
                { col: 'reorder_point', line: 4, span: 2 },
                { col: 'vendor', line: 4, span: 4 },
                { col: 'counted', line: 5, span: 3 },
            ],
        },
    ],
}

const STOCK_NAME: ResultColumn = { id: 'name', label: 'Item', type: 'text', sortable: true }
const STOCK_BIN: ResultColumn = { id: 'bin', label: 'Bin', type: 'text', sortable: true }
const STOCK_IN_BIN: ResultColumn = { id: 'in_bin', label: 'In bin', type: 'number', sortable: true }

// View = Stock status.
export const STOCK_STATUS_COLUMNS: ResultColumn[] = [
    STOCK_NAME,
    STOCK_BIN,
    STOCK_IN_BIN,
    { id: 'on_hand', label: 'On hand', type: 'number', sortable: true },
    { id: 'on_po', label: 'On PO', type: 'number', sortable: true },
    { id: 'reorder_point', label: 'Reorder point', type: 'number', sortable: true },
    { id: 'status', label: 'Status', type: 'text', sortable: true },
    { id: 'vendor', label: 'Preferred vendor', type: 'text', sortable: true },
]

// View = Count sheet: `showWhen` leaves five columns out of the result, and `counted` is a
// write-in column (core change 2). It is not a sort key.
export const COUNT_SHEET_COLUMNS: ResultColumn[] = [
    STOCK_NAME,
    STOCK_BIN,
    STOCK_IN_BIN,
    { id: 'counted', label: 'Counted', type: 'number' },
]

// The cells of a low row that core change 1 draws in the warning tone (`columns[].tone`,
// `when: product.low_stock`).
export const STOCK_STATUS_TONES = { columns: ['status', 'on_hand'], tone: 'warning' } as const

export interface StockStatusInput {
    view?: StockView
    show?: StockShow
    order?: StockOrder
    /** Bin ids the Bin filter keeps ('' is No bin). */
    bins?: string[]
}

interface StockLine {
    stock: BinStockRecord
    item: ReportItemRecord
}

// The row rule (spec §4 Stock Status spec): a quantity that is not 0, or the default bin's
// row of an item with nothing on hand.
function isStockRow({ stock, item }: StockLine): boolean {
    if (stock.quantity !== 0) return true
    return item.quantity_on_hand === 0 && stock.bin === item.default_bin
}

// "All items": active, or with a quantity on hand or on PO.
function isStockItemShown(item: ReportItemRecord, show: StockShow): boolean {
    if (show === 'low') return item.low_stock
    return !item.inactive || item.quantity_on_hand !== 0 || item.quantity_on_po !== 0
}

// "No bin" last, then the bin's name in natural order.
function byBin(a: StockLine, b: StockLine): number {
    const left = binOf(a.stock.bin)
    const right = binOf(b.stock.bin)
    if (!left || !right) return (left ? 0 : 1) - (right ? 0 : 1)
    return compareNatural(left.name, right.name)
}

function stockOrder(order: StockOrder): (a: StockLine, b: StockLine) => number {
    if (order === 'bin') return (a, b) => byBin(a, b) || byName(a.item, b.item)
    const byItem = order === 'code' ? byCode : byName
    return (a, b) => byItem(a.item, b.item) || byBin(a, b)
}

function stockCells({ stock, item }: StockLine, view: StockView): Record<string, CellValue> {
    const bin = { bin: reportBinLabel(stock.bin), in_bin: stock.quantity }
    if (view === 'count') return { ...bin, counted: null }
    return {
        ...bin,
        on_hand: item.quantity_on_hand,
        on_po: blankZero(item.quantity_on_po),
        reorder_point: blankZero(item.reorder_point),
        status: item.low_stock ? LOW_STOCK_WORDS : null,
        vendor: VENDOR_NAMES[item.preferred_vendor] ?? null,
    }
}

function stockLines(input: StockStatusInput): StockLine[] {
    const show = input.show ?? 'all'
    return REPORT_BIN_STOCK.map(stock => ({ stock, item: itemOf(stock.product) }))
        .filter(isStockRow)
        .filter(line => isStockItemShown(line.item, show))
        .filter(line => !input.bins || input.bins.includes(line.stock.bin))
        .sort(stockOrder(input.order ?? 'name'))
}

function stockParams(input: StockStatusInput): ResolvedParam[] {
    const bins: ResolvedParam = input.bins
        ? { id: 'bins', type: 'choice', list: input.bins }
        : { id: 'bins', type: 'choice', unset: true }
    return [
        { id: 'view', type: 'choice', value: input.view ?? 'status' },
        { id: 'show', type: 'choice', value: input.show ?? 'all' },
        bins,
        { id: 'vendors', type: 'choice', unset: true },
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

// No Total row (`noTotal`): quantities of different items do not add up.
export function stockStatusResult(input: StockStatusInput = {}): RunResult {
    const view = input.view ?? 'status'
    const rows: ResultRow[] = stockLines(input).map(line => ({
        id: `d:${line.stock.id}`,
        kind: 'detail',
        depth: 0,
        label: reportItemLabel(line.item),
        open: `books/products/${line.item.id}`,
        cells: stockCells(line, view),
    }))
    return {
        columns: view === 'count' ? COUNT_SHEET_COLUMNS : STOCK_STATUS_COLUMNS,
        rows,
        notices: [],
        headerLines: [(input.bins ?? []).map(reportBinLabel).join(', '), ''],
        topics: [
            'collection/books_bin_stock',
            'collection/books_bins',
            'collection/books_products',
            'collection/books_vendors',
        ],
        heading: INVENTORY_REPORTS_HEADING,
        page: null,
        params: stockParams(input),
    }
}

export function emptyStockStatusResult(): RunResult {
    return { ...stockStatusResult(), rows: [] }
}

// ---- The Low stock widget (spec §3.5) ----

// The columns the widget's live query reads of a low, active item.
export type LowStockRow = Pick<
    BooksProducts,
    'id' | 'name' | 'quantity_on_hand' | 'reorder_point' | 'quantity_on_po'
>

function lowRowOf(item: ReportItemRecord): LowStockRow {
    const { id, name, quantity_on_hand, reorder_point, quantity_on_po } = item
    return { id, name, quantity_on_hand, reorder_point, quantity_on_po }
}

export const LOW_STOCK_NONE: LowStockRow[] = []

// One low item: the singular label.
export const LOW_STOCK_ONE: LowStockRow[] = [lowRowOf(itemOf(ITEM.paperRoll))]

// What the seed gives: the paper roll and the mailers, in the query's order (not sorted).
export const LOW_STOCK_TWO: LowStockRow[] = REPORT_ITEMS.filter(
    item => item.low_stock && !item.inactive
).map(lowRowOf)

// Reference only: more than 5 low items, a long name, a quantity with decimals, nothing on
// hand, a quantity on PO, and an item at its reorder point.
export const LOW_STOCK_SEVEN: LowStockRow[] = [
    { ...lowRowOf(itemOf(ITEM.labels)), reorder_point: 40 },
    lowRowOf(itemOf(ITEM.paperRoll)),
    { ...lowRowOf(itemOf(ITEM.scanner)), quantity_on_hand: 4 },
    { ...lowRowOf(itemOf(ITEM.tape)), reorder_point: 20 },
    { ...lowRowOf(PRINTER), reorder_point: 1 },
    { ...lowRowOf(BUBBLE_MAILERS), quantity_on_po: 50 },
    {
        id: 'prodpolymail001',
        name: 'Poly mailers, 10 x 13 in',
        quantity_on_hand: 2,
        reorder_point: 30,
        quantity_on_po: 0,
    },
]

export const LOW_STOCK_ROW_LIMIT = 5

// What `lowStockModel(rows)` (lib/dashboard-figures.ts, a later checkpoint) gives: the
// count, the rows furthest below their reorder point first (on hand − reorder point, lowest
// first; then name), cut to 5, and how many are left.
export interface LowStockModel {
    count: number
    rows: LowStockRow[]
    moreCount: number
}

function expectedModel(rows: LowStockRow[], order: string[]): LowStockModel {
    const shown = order.map(id => {
        const row = rows.find(item => item.id === id)
        if (!row) throw new Error(`inventory reports fixture: unknown low row ${id}`)
        return row
    })
    return { count: rows.length, rows: shown, moreCount: rows.length - shown.length }
}

export const LOW_STOCK_MODELS = {
    none: expectedModel(LOW_STOCK_NONE, []),
    one: expectedModel(LOW_STOCK_ONE, [ITEM.paperRoll]),
    // −17, then −9.
    two: expectedModel(LOW_STOCK_TWO, [ITEM.mailers, ITEM.paperRoll]),
    // −28, −17, −9, −4, −1.5; the printer (−1) and the scanner (0) are the "2 more items".
    seven: expectedModel(LOW_STOCK_SEVEN, [
        'prodpolymail001',
        ITEM.mailers,
        ITEM.paperRoll,
        ITEM.labels,
        ITEM.tape,
    ]),
} as const

export const LOW_STOCK_TEXTS = {
    title: 'Low stock',
    figureOne: 'item at or below its reorder point',
    figureMany: 'items at or below their reorder point',
    noneLow: 'No items are low on stock.',
    reportLink: 'Stock Status report',
    listLink: 'View low stock items',
    customizeNote: 'Shows when you have Inventory items.',
} as const
