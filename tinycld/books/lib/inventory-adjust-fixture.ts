// Synthetic bins, Inventory items, stock moves, inventory adjustments and moves between
// bins for the helix reference route, the seed (seed.ts) and tests (inventory-adjust spec
// §4 Seed). Plain data: it imports other fixtures and types only, because the seed graph
// runs in plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). Quantities have at most 2 decimals. Cost is per
// item, never per bin: a bin row holds a quantity only. The rows of an item in
// BIN_STOCK add up to its `quantity_on_hand`; the fixture checks that at load.
//
// The book's costing method is FIFO (books-settings-fixture). The values here are what the
// server writes once the documents below are posted in date order.
//
// Schema: `books_bins`, `books_bin_stock`, `books_bin_transfers` and the new columns of
// `books_products`, `books_stock_moves`, `books_inventory_adjustments` and
// `books_inventory_adjustment_lines` do not exist yet. CHECKPOINT 1 (the migration) must
// replace every interface marked "checkpoint 1" below with the generated type
// (`BooksBins`, `BooksBinStock`, `BooksBinTransfers`, and the plain `Books…` row types in
// place of the `& …Columns` intersections), so tsc checks each column.

import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type {
    BooksInventoryAdjustmentLines,
    BooksInventoryAdjustments,
    BooksProducts,
    BooksStockLayers,
    BooksStockMoves,
} from '../types'
import { INVOICE_USER_IDS, INVOICE_USER_NAMES } from './invoice-form-fixture'
import { PRODUCT_IDS } from './products-services-fixture'

export const INVENTORY_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const INVENTORY_TODAY = '2026-11-27'

export const INVENTORY_USER_IDS = INVOICE_USER_IDS
export const INVENTORY_USER_NAMES = INVOICE_USER_NAMES

const STAMP = '2026-11-27 09:00:00.000Z'

// ---- Bins ----

// checkpoint 1: replace with the generated `BooksBins` (less the hidden `sort_key`).
export interface BinRecord {
    id: string
    name: string
    note: string
    inactive: boolean
    created: string
    updated: string
}

export const BIN_IDS = {
    aisle3: 'binaisle3shelfb',
    frontCounter: 'binfrontcounter',
    // Inactive, and it still holds stock: "(inactive)" in the report and on the item page.
    backRoom: 'binbackroom0001',
} as const

// '' is "No bin": stock that is in no bin location.
export const NO_BIN = ''
export const NO_BIN_LABEL = 'No bin'

export const BINS: BinRecord[] = [
    {
        id: BIN_IDS.aisle3,
        name: 'Aisle 3, shelf B',
        note: 'Labels, paper and small devices. Left side, at eye level.',
        inactive: false,
        created: STAMP,
        updated: STAMP,
    },
    {
        id: BIN_IDS.frontCounter,
        name: 'Front counter',
        note: '',
        inactive: false,
        created: STAMP,
        updated: STAMP,
    },
    {
        id: BIN_IDS.backRoom,
        name: 'Back room',
        note: 'Closed in October 2026. Move what is left to Aisle 3, shelf B before the year-end count.',
        inactive: true,
        created: STAMP,
        updated: STAMP,
    },
]

export const EMPTY_BINS: BinRecord[] = []

export function binLabel(id: string): string {
    if (id === NO_BIN) return NO_BIN_LABEL
    const bin = BINS.find(row => row.id === id)
    if (!bin) throw new Error(`inventory fixture: unknown bin ${id}`)
    return bin.inactive ? `${bin.name} (inactive)` : bin.name
}

// ---- Inventory items ----

// checkpoint 1: these two columns join the generated `BooksProducts`.
interface ProductBinColumns {
    default_bin: string
    low_stock: boolean
}

// The columns the seed writes and the screens of this unit read. The seed adds these
// rows beside products-services-fixture's (the label printer among them, with no stock).
export type InventoryItemRecord = Pick<
    BooksProducts,
    | 'id'
    | 'type'
    | 'name'
    | 'code'
    | 'vendor_part_no'
    | 'price'
    | 'cost'
    | 'purchases'
    | 'purchase_description'
    | 'reorder_point'
    | 'opening_quantity'
    | 'opening_value'
    | 'opening_date'
    | 'quantity_on_hand'
    | 'stock_value'
    | 'quantity_on_po'
    | 'inactive'
    | 'currency'
> &
    ProductBinColumns

export const INVENTORY_ITEM_IDS = {
    // 36 on hand in two bins; every kind of stock move. The item page's example.
    labels: 'prodshiplabel01',
    // Low: 3 on hand, reorder point 12.
    paperRoll: 'prodpaperroll01',
    // A FIFO history of three receipts, 6 on a purchase order, 2 in an inactive bin.
    scanner: 'prodscanner2d01',
    // A long name, no default bin, and a bin below zero.
    tape: 'prodpacktape001',
    // products-services-fixture's Inventory item: no stock, no movement (the empty page).
    printer: PRODUCT_IDS.labelPrinter,
} as const

const ITEM = INVENTORY_ITEM_IDS

export const INVENTORY_ITEMS: InventoryItemRecord[] = [
    {
        id: ITEM.labels,
        type: 'inventory',
        name: 'Shipping labels, 4 x 6 in, roll of 500',
        code: 'SHIP-LBL',
        vendor_part_no: 'NWP-4X6-500',
        price: 2_400,
        cost: 1_150,
        purchases: true,
        purchase_description: 'Direct thermal shipping labels, 4 x 6 in, 500 per roll.',
        reorder_point: 10,
        opening_quantity: 40,
        opening_value: 46_000,
        opening_date: '2026-07-01',
        quantity_on_hand: 36,
        stock_value: 41_400,
        quantity_on_po: 0,
        inactive: false,
        currency: INVENTORY_CURRENCY,
        default_bin: BIN_IDS.aisle3,
        low_stock: false,
    },
    {
        id: ITEM.paperRoll,
        type: 'inventory',
        name: 'Receipt paper roll, 80 mm',
        code: 'RCPT-80',
        vendor_part_no: '',
        price: 450,
        cost: 195,
        purchases: true,
        purchase_description: 'Thermal receipt paper, 80 mm x 70 m.',
        reorder_point: 12,
        opening_quantity: 30,
        opening_value: 5_850,
        opening_date: '2026-07-01',
        quantity_on_hand: 3,
        stock_value: 585,
        quantity_on_po: 0,
        inactive: false,
        currency: INVENTORY_CURRENCY,
        default_bin: BIN_IDS.frontCounter,
        low_stock: true,
    },
    {
        id: ITEM.scanner,
        type: 'inventory',
        name: 'Barcode scanner, 2D, USB',
        code: 'SCAN-2D',
        vendor_part_no: 'ZX-2200-U',
        price: 12_900,
        cost: 6_800,
        purchases: true,
        purchase_description: 'Handheld 2D barcode scanner with stand, USB.',
        reorder_point: 4,
        opening_quantity: 0,
        opening_value: 0,
        opening_date: '',
        quantity_on_hand: 14,
        stock_value: 93_500,
        quantity_on_po: 6,
        inactive: false,
        currency: INVENTORY_CURRENCY,
        default_bin: BIN_IDS.aisle3,
        low_stock: false,
    },
    {
        id: ITEM.tape,
        type: 'inventory',
        name: 'Packing tape, heavy duty, 48 mm x 100 m, clear, case of 36 rolls for the shipping bench',
        code: 'TAPE-HD-48-CLR-36',
        vendor_part_no: 'OSW-TAPE-48100-C36',
        price: 8_900,
        cost: 5_250,
        purchases: true,
        purchase_description: 'Heavy duty packing tape, 48 mm x 100 m, clear, 36 rolls per case.',
        reorder_point: 0,
        opening_quantity: 18.5,
        opening_value: 97_125,
        opening_date: '2026-07-01',
        quantity_on_hand: 18.5,
        stock_value: 97_125,
        quantity_on_po: 0,
        inactive: false,
        currency: INVENTORY_CURRENCY,
        default_bin: NO_BIN,
        low_stock: false,
    },
]

// The label printer as this unit's screens read it: an Inventory item with no stock.
export const INVENTORY_PRINTER: InventoryItemRecord = {
    id: ITEM.printer,
    type: 'inventory',
    name: 'Thermal label printer',
    code: 'THERMAL',
    vendor_part_no: '',
    price: 0,
    cost: 28_900,
    purchases: true,
    purchase_description: 'Thermal label printer, 4 x 6 in, USB and Ethernet.',
    reorder_point: 0,
    opening_quantity: 0,
    opening_value: 0,
    opening_date: '',
    quantity_on_hand: 0,
    stock_value: 0,
    quantity_on_po: 0,
    inactive: false,
    currency: INVENTORY_CURRENCY,
    default_bin: NO_BIN,
    low_stock: false,
}

export function inventoryItem(id: string): InventoryItemRecord {
    const item = [...INVENTORY_ITEMS, INVENTORY_PRINTER].find(row => row.id === id)
    if (!item) throw new Error(`inventory fixture: unknown item ${id}`)
    return item
}

// ---- Stock in bins ----

// checkpoint 1: replace with the generated `BooksBinStock`.
export interface BinStockRecord {
    id: string
    product: string
    // '' is No bin.
    bin: string
    quantity: number
}

export const BIN_STOCK: BinStockRecord[] = [
    { id: 'bstklabelaisle3', product: ITEM.labels, bin: BIN_IDS.aisle3, quantity: 32 },
    { id: 'bstklabelfront1', product: ITEM.labels, bin: BIN_IDS.frontCounter, quantity: 4 },
    { id: 'bstkpaperfront1', product: ITEM.paperRoll, bin: BIN_IDS.frontCounter, quantity: 3 },
    { id: 'bstkscanaisle31', product: ITEM.scanner, bin: BIN_IDS.aisle3, quantity: 12 },
    { id: 'bstkscanbackrm1', product: ITEM.scanner, bin: BIN_IDS.backRoom, quantity: 2 },
    { id: 'bstktapenobin01', product: ITEM.tape, bin: NO_BIN, quantity: 20.5 },
    // A sale took more from the counter than it held: a bin may go below zero (Q9).
    { id: 'bstktapefront01', product: ITEM.tape, bin: BIN_IDS.frontCounter, quantity: -2 },
]

export function binStockOf(product: string): BinStockRecord[] {
    return BIN_STOCK.filter(row => row.product === product && row.quantity !== 0)
}

export function binQuantity(product: string, bin: string): number {
    return BIN_STOCK.find(row => row.product === product && row.bin === bin)?.quantity ?? 0
}

for (const item of INVENTORY_ITEMS) {
    const inBins = binStockOf(item.id).reduce((sum, row) => sum + Math.round(row.quantity * 100), 0)
    if (inBins !== Math.round(item.quantity_on_hand * 100)) {
        throw new Error(`inventory fixture: the bins of ${item.id} do not add up to its on hand`)
    }
}

// ---- Moves between bins ----

// checkpoint 1: replace with the generated `BooksBinTransfers`.
export interface BinTransferRecord {
    id: string
    product: string
    from_bin: string
    to_bin: string
    quantity: number
    memo: string
    created_by: string
    created: string
}

export const BIN_TRANSFERS: BinTransferRecord[] = [
    {
        id: 'bxfrlabels00002',
        product: ITEM.labels,
        from_bin: BIN_IDS.aisle3,
        to_bin: BIN_IDS.frontCounter,
        quantity: 4,
        memo: 'Counter stock for the holiday rush',
        created_by: INVENTORY_USER_IDS.ana,
        created: '2026-11-03 15:20:00.000Z',
    },
    {
        id: 'bxfrlabels00001',
        product: ITEM.labels,
        from_bin: NO_BIN,
        to_bin: BIN_IDS.aisle3,
        quantity: 12,
        memo: '',
        created_by: INVENTORY_USER_IDS.omar,
        created: '2026-09-04 10:05:00.000Z',
    },
]

// ---- Stock moves ----

// checkpoint 1: these two columns join the generated `BooksStockMoves`.
interface StockMoveBinColumns {
    bin: string
    // The number of the move's document ('' when it has none: opening stock).
    document_number: string
}

export type StockMoveRecord = Pick<
    BooksStockMoves,
    | 'id'
    | 'product'
    | 'date'
    | 'seq'
    | 'kind'
    | 'source'
    | 'document'
    | 'quantity'
    | 'value'
    | 'quantity_after'
    | 'value_after'
> &
    StockMoveBinColumns

export const ADJUSTMENT_IDS = {
    // Books made it for the opening stock of the shipping labels.
    opening: 'iadjopening0010',
    // Void 11: the posted adjustment that 12 corrected ("Replaced by").
    replaced: 'iadjvoid0000011',
    // Posted 12: a decrease in a bin and an increase at a cost.
    posted: 'iadjposted00012',
    // Books made it when the cost of Bill 318 changed.
    recost: 'iadjrecost00013',
    // Posted 14: found stock at no cost, so it has no journal entry.
    noValue: 'iadjnovalue0014',
    // A draft of four lines: a decrease, a revaluation, an increase with no cost typed and
    // a decrease that takes its bin below zero.
    draft: 'iadjdraft000001',
} as const

const ADJ = ADJUSTMENT_IDS

type MoveSeed = Omit<StockMoveRecord, 'quantity_after' | 'value_after' | 'seq'>

// Fills `seq`, `quantity_after` and `value_after` in date order, as the costing replay
// does.
function movesOf(seeds: MoveSeed[]): StockMoveRecord[] {
    let quantity = 0
    let value = 0
    return seeds.map((seed, index) => {
        quantity = Math.round((quantity + seed.quantity) * 100) / 100
        value += seed.value
        return { ...seed, seq: index + 1, quantity_after: quantity, value_after: value }
    })
}

const LABEL_MOVES = movesOf([
    {
        id: 'smovlabel000001',
        product: ITEM.labels,
        date: '2026-07-01',
        kind: 'opening',
        source: 'books_inventory_adjustments',
        document: ADJ.opening,
        quantity: 40,
        value: 46_000,
        bin: BIN_IDS.aisle3,
        document_number: '',
    },
    {
        id: 'smovlabel000002',
        product: ITEM.labels,
        date: '2026-08-14',
        kind: 'sale',
        source: 'books_invoices',
        document: 'invstockmov1042',
        quantity: -12,
        value: -13_800,
        bin: BIN_IDS.aisle3,
        document_number: '1042',
    },
    {
        id: 'smovlabel000003',
        product: ITEM.labels,
        date: '2026-09-02',
        kind: 'receipt',
        source: 'books_bills',
        document: 'billstockmov318',
        quantity: 24,
        value: 27_600,
        bin: BIN_IDS.aisle3,
        document_number: '318',
    },
    {
        id: 'smovlabel000004',
        product: ITEM.labels,
        date: '2026-09-20',
        kind: 'sale',
        source: 'books_sales_receipts',
        document: 'srcpstockmv2007',
        quantity: -10,
        value: -11_500,
        bin: BIN_IDS.aisle3,
        document_number: '2007',
    },
    {
        id: 'smovlabel000005',
        product: ITEM.labels,
        date: '2026-10-05',
        kind: 'customer_return',
        source: 'books_credit_memos',
        document: 'cmemstockmv3003',
        quantity: 2,
        value: 2_300,
        bin: BIN_IDS.aisle3,
        document_number: '3003',
    },
    {
        id: 'smovlabel000006',
        product: ITEM.labels,
        date: '2026-10-18',
        kind: 'vendor_return',
        source: 'books_vendor_credits',
        document: 'vcrdstockmv0012',
        quantity: -4,
        value: -4_600,
        bin: BIN_IDS.aisle3,
        document_number: '12',
    },
    {
        id: 'smovlabel000007',
        product: ITEM.labels,
        date: '2026-11-03',
        kind: 'adjustment',
        source: 'books_inventory_adjustments',
        document: ADJ.posted,
        quantity: -4,
        value: -4_600,
        bin: BIN_IDS.aisle3,
        document_number: '12',
    },
])

const SCANNER_MOVES = movesOf([
    {
        id: 'smovscan0000001',
        product: ITEM.scanner,
        date: '2026-08-12',
        kind: 'receipt',
        source: 'books_bills',
        document: 'billstockmov305',
        quantity: 6,
        value: 38_400,
        bin: BIN_IDS.backRoom,
        document_number: '305',
    },
    {
        id: 'smovscan0000002',
        product: ITEM.scanner,
        date: '2026-09-18',
        kind: 'sale',
        source: 'books_invoices',
        document: 'invstockmov1057',
        quantity: -4,
        value: -25_600,
        bin: BIN_IDS.backRoom,
        document_number: '1057',
    },
    {
        id: 'smovscan0000003',
        product: ITEM.scanner,
        date: '2026-09-30',
        kind: 'receipt',
        source: 'books_bills',
        document: 'billstockmov322',
        quantity: 6,
        value: 39_900,
        bin: BIN_IDS.aisle3,
        document_number: '322',
    },
    {
        id: 'smovscan0000004',
        product: ITEM.scanner,
        date: '2026-11-03',
        kind: 'adjustment',
        source: 'books_inventory_adjustments',
        document: ADJ.posted,
        quantity: 2,
        value: 13_600,
        bin: BIN_IDS.aisle3,
        document_number: '12',
    },
    {
        id: 'smovscan0000005',
        product: ITEM.scanner,
        date: '2026-11-04',
        kind: 'receipt',
        source: 'books_bills',
        document: 'billstockmov331',
        quantity: 4,
        value: 27_200,
        bin: BIN_IDS.aisle3,
        document_number: '331',
    },
])

export const STOCK_MOVES: StockMoveRecord[] = [...LABEL_MOVES, ...SCANNER_MOVES]

// An item's moves, newest first (date, then order), as the item page lists them.
export function stockMovesOf(product: string): StockMoveRecord[] {
    return STOCK_MOVES.filter(row => row.product === product).sort(
        (a, b) => b.date.localeCompare(a.date) || b.seq - a.seq
    )
}

// ---- Cost layers (FIFO): what is left of each receipt ----

export type StockLayerRecord = Pick<
    BooksStockLayers,
    'id' | 'product' | 'move' | 'date' | 'quantity' | 'value' | 'position'
>

export const STOCK_LAYERS: StockLayerRecord[] = [
    {
        id: 'slyrlabel000001',
        product: ITEM.labels,
        move: 'smovlabel000001',
        date: '2026-07-01',
        quantity: 12,
        value: 13_800,
        position: 1,
    },
    {
        id: 'slyrlabel000002',
        product: ITEM.labels,
        move: 'smovlabel000003',
        date: '2026-09-02',
        quantity: 24,
        value: 27_600,
        position: 2,
    },
    {
        id: 'slyrscan0000001',
        product: ITEM.scanner,
        move: 'smovscan0000001',
        date: '2026-08-12',
        quantity: 2,
        value: 12_800,
        position: 1,
    },
    {
        id: 'slyrscan0000002',
        product: ITEM.scanner,
        move: 'smovscan0000003',
        date: '2026-09-30',
        quantity: 6,
        value: 39_900,
        position: 2,
    },
    {
        id: 'slyrscan0000003',
        product: ITEM.scanner,
        move: 'smovscan0000004',
        date: '2026-11-03',
        quantity: 2,
        value: 13_600,
        position: 3,
    },
    {
        id: 'slyrscan0000004',
        product: ITEM.scanner,
        move: 'smovscan0000005',
        date: '2026-11-04',
        quantity: 4,
        value: 27_200,
        position: 4,
    },
]

export function stockLayersOf(product: string): StockLayerRecord[] {
    return STOCK_LAYERS.filter(row => row.product === product).sort(
        (a, b) => a.position - b.position
    )
}

// ---- Inventory adjustments ----

// checkpoint 1: these three columns join the generated `BooksInventoryAdjustments`.
interface AdjustmentNewColumns {
    // The sum of its stock moves' values, written at the post.
    value_change: number
    replaces: string
    replaced_by: string
}

// `account_name` is a fixture column: '' is the chart's Inventory shrinkage account, which
// the server creates at the first post, so the seed has no id or number to name it by.
export type AdjustmentRecord = Omit<BooksInventoryAdjustments, 'account' | 'sort_key' | 'entry'> &
    AdjustmentNewColumns & {
        account_name: string
        // True when the post wrote a journal entry (the seed leaves `entry` to the server).
        has_entry: boolean
    }

// checkpoint 1: `bin` joins the generated `BooksInventoryAdjustmentLines`.
export type AdjustmentLineRecord = BooksInventoryAdjustmentLines & {
    bin: string
    // What Books posted for the line (its stock move's value); 0 on a draft.
    posted_value: number
}

type AdjustmentSeed = Pick<AdjustmentRecord, 'id' | 'status' | 'number' | 'date'> &
    Partial<AdjustmentRecord>

const SHRINKAGE = 'Inventory shrinkage'

function adjustment(seed: AdjustmentSeed): AdjustmentRecord {
    const isPosted = seed.status !== 'draft'
    return {
        kind: 'manual',
        sequence: Number(seed.number) || 0,
        account_name: SHRINKAGE,
        memo: '',
        source: '',
        document: '',
        currency: INVENTORY_CURRENCY,
        has_entry: isPosted,
        posted_at: isPosted ? `${seed.date} 16:42:00.000Z` : '',
        posted_by: isPosted ? INVENTORY_USER_IDS.ana : '',
        voided_at: '',
        voided_by: '',
        value_change: 0,
        replaces: '',
        replaced_by: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const ADJUSTMENTS: AdjustmentRecord[] = [
    adjustment({
        id: ADJ.opening,
        status: 'posted',
        kind: 'opening',
        number: '10',
        date: '2026-07-01',
        account_name: 'Opening Balance Equity',
        memo: 'Opening stock of Shipping labels, 4 x 6 in, roll of 500',
        source: 'books_products',
        document: ITEM.labels,
        value_change: 46_000,
    }),
    adjustment({
        id: ADJ.replaced,
        status: 'void',
        number: '11',
        date: '2026-11-03',
        memo: 'Cycle count, aisle 3',
        voided_at: '2026-11-03 16:42:00.000Z',
        voided_by: INVENTORY_USER_IDS.ana,
        value_change: -3_450,
        replaced_by: ADJ.posted,
    }),
    adjustment({
        id: ADJ.posted,
        status: 'posted',
        number: '12',
        date: '2026-11-03',
        memo: 'Cycle count, aisle 3. Four label rolls were water damaged; two scanners were found unpacked in the receiving cage and never billed.',
        value_change: 9_000,
        replaces: ADJ.replaced,
    }),
    adjustment({
        id: ADJ.recost,
        status: 'posted',
        kind: 'recost',
        number: '13',
        date: '2026-11-10',
        source: 'books_bills',
        document: 'billstockmov318',
        memo: 'Bill 318',
        value_change: 1_200,
        posted_by: '',
    }),
    adjustment({
        id: ADJ.noValue,
        status: 'posted',
        number: '14',
        date: '2026-11-18',
        memo: 'Two cases found behind the bench',
        has_entry: false,
        posted_by: INVENTORY_USER_IDS.omar,
    }),
    adjustment({
        id: ADJ.draft,
        status: 'draft',
        number: '',
        date: '2026-11-24',
        memo: 'November count, front counter',
    }),
]

export const EMPTY_ADJUSTMENTS: AdjustmentRecord[] = []

type LineSeed = Pick<AdjustmentLineRecord, 'id' | 'adjustment' | 'product' | 'position'> &
    Partial<AdjustmentLineRecord>

function line(seed: LineSeed): AdjustmentLineRecord {
    return {
        quantity: 0,
        value: 0,
        bin: NO_BIN,
        posted_value: 0,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const ADJUSTMENT_LINES: AdjustmentLineRecord[] = [
    line({
        id: 'ialnopening0001',
        adjustment: ADJ.opening,
        product: ITEM.labels,
        position: 1,
        quantity: 40,
        value: 46_000,
        bin: BIN_IDS.aisle3,
        posted_value: 46_000,
    }),
    line({
        id: 'ialnvoid0000001',
        adjustment: ADJ.replaced,
        product: ITEM.labels,
        position: 1,
        quantity: -3,
        bin: BIN_IDS.aisle3,
        posted_value: -3_450,
    }),
    // A decrease in a bin: the costing method gives its cost.
    line({
        id: 'ialnposted00001',
        adjustment: ADJ.posted,
        product: ITEM.labels,
        position: 1,
        quantity: -4,
        bin: BIN_IDS.aisle3,
        posted_value: -4_600,
    }),
    // An increase at a cost.
    line({
        id: 'ialnposted00002',
        adjustment: ADJ.posted,
        product: ITEM.scanner,
        position: 2,
        quantity: 2,
        value: 13_600,
        bin: BIN_IDS.aisle3,
        posted_value: 13_600,
    }),
    // A revaluation: no quantity, so no bin.
    line({
        id: 'ialnrecost00001',
        adjustment: ADJ.recost,
        product: ITEM.labels,
        position: 1,
        value: 1_200,
        posted_value: 1_200,
    }),
    line({
        id: 'ialnnovalue0001',
        adjustment: ADJ.noValue,
        product: ITEM.tape,
        position: 1,
        quantity: 2,
        bin: NO_BIN,
    }),
    line({
        id: 'ialndraft000001',
        adjustment: ADJ.draft,
        product: ITEM.paperRoll,
        position: 1,
        quantity: -2,
        bin: BIN_IDS.frontCounter,
    }),
    line({
        id: 'ialndraft000002',
        adjustment: ADJ.draft,
        product: ITEM.tape,
        position: 2,
        value: -1_250,
    }),
    line({
        id: 'ialndraft000003',
        adjustment: ADJ.draft,
        product: ITEM.labels,
        position: 3,
        quantity: 10,
        bin: BIN_IDS.frontCounter,
    }),
    // Takes the counter's −2 further below zero: the warning hint (spec §3.3).
    line({
        id: 'ialndraft000004',
        adjustment: ADJ.draft,
        product: ITEM.tape,
        position: 4,
        quantity: -1.5,
        bin: BIN_IDS.frontCounter,
    }),
]

export function adjustmentOf(id: string): AdjustmentRecord {
    const row = ADJUSTMENTS.find(item => item.id === id)
    if (!row) throw new Error(`inventory fixture: unknown adjustment ${id}`)
    return row
}

export function adjustmentLinesOf(id: string): AdjustmentLineRecord[] {
    return ADJUSTMENT_LINES.filter(row => row.adjustment === id).sort(
        (a, b) => a.position - b.position
    )
}

// The texts the screens show (spec §3); the server's own refusals are in
// server/inventory_adjustments.go and are shown as they come.
export const INVENTORY_TEXTS = {
    noLines: 'Add a line to the inventory adjustment.',
    lineEmpty: 'Enter a quantity change, a value change, or both.',
    belowZero: 'Quantity on hand goes below zero.',
    lastCostHint: 'Empty uses the last cost.',
    atCost: 'At cost',
    shrinkageHint: 'Empty uses Inventory shrinkage. Books creates the account when you post.',
    memoHint: 'Only your team sees this.',
    noAccess: 'You need bookkeeper access to create inventory adjustments',
    notFound: 'Inventory adjustment not found',
    loadFailed: 'Could not load this inventory adjustment.',
    noEntry: 'No journal entry: this adjustment changed no value.',
    deleteDraft: 'Delete this draft inventory adjustment? This can’t be undone.',
    listEmpty: 'No inventory adjustments yet',
    binsEmpty: 'A bin location is a place where you keep stock, for example Aisle 3, shelf B.',
    binNameTaken: 'A bin location named Aisle 3, shelf B exists.',
    binInUse: 'Aisle 3, shelf B has stock or history. Make it inactive instead.',
    moveTooMany: 'Aisle 3, shelf B holds 32. Move 32 or fewer.',
    movementsEmpty: 'No stock movements yet. Post a bill, or adjust the stock.',
    noLowItems: 'No items are low on stock.',
    reportEmpty: 'No stock in a bin location',
    // A server refusal of a post, shown on its line ("Line n: …").
    lineRefusal: 'Line 3: A quantity increase cannot have a value below 0.',
    voidBody: 'Void inventory adjustment 12? Its stock change is taken back.',
    openingNotice:
        'Books made this adjustment for the opening stock of Shipping labels, 4 x 6 in, roll of 500. To change it, change the item’s opening stock.',
    recostNotice: 'Books made this adjustment when the cost of Bill 318 changed.',
    closedPeriod: 'The books are closed through June 30, 2026. Choose a later date.',
} as const

// ---- The Stock by Bin Location report (spec §3.9) as static core types ----

export const STOCK_BY_BIN_TITLE = 'Stock by Bin Location'
export const STOCK_BY_BIN_DESCRIPTION = 'Quantity on hand of each item, by the bin it is in.'
export const STOCK_BY_BIN_HEADING = 'Harbor Lane Design LLC'

export const STOCK_BY_BIN_PARAMS: ParamDef[] = [
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
        id: 'order',
        type: 'choice',
        label: 'Order',
        options: [
            { value: 'name', label: 'Item name' },
            { value: 'code', label: 'Item code' },
        ],
        default: 'name',
    },
]

// One group, Bin, open at the start, with no subtotal row (the bin row holds its count).
export const STOCK_BY_BIN_GROUPS: { subtotals?: boolean; open: boolean }[] = [{ open: true }]

// One line where a row is 420 px or wider; a narrower row takes two lines: the label and
// the bin's item count, then Quantity and Reorder point.
export const STOCK_BY_BIN_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '420px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
    },
    layouts: [
        {
            width: 'mobile',
            tracks: 2,
            cells: [
                { col: 'name', line: 1 },
                { col: 'items', line: 1 },
                { col: 'quantity', line: 2 },
                { col: 'reorder_point', line: 2 },
            ],
        },
    ],
}

export const STOCK_BY_BIN_COLUMNS: ResultColumn[] = [
    { id: 'name', label: 'Bin', type: 'text' },
    // A bin row's count of its items; blank on an item row.
    { id: 'items', label: 'Items', type: 'number', aggregate: 'count' },
    { id: 'quantity', label: 'Quantity', type: 'number' },
    { id: 'reorder_point', label: 'Reorder point', type: 'number' },
]

function reportBins(): string[] {
    const ids = [...new Set(BIN_STOCK.filter(row => row.quantity !== 0).map(row => row.bin))]
    // No bin sorts last, as a blank group key does.
    return ids.sort((a, b) => {
        if (a === NO_BIN) return 1
        if (b === NO_BIN) return -1
        return binLabel(a).localeCompare(binLabel(b))
    })
}

function binRows(bin: string): ResultRow[] {
    const stock = BIN_STOCK.filter(row => row.bin === bin && row.quantity !== 0)
    const groupId = `g:${JSON.stringify([bin])}`
    const group: ResultRow = {
        id: groupId,
        kind: 'group',
        depth: 0,
        level: 1,
        label: binLabel(bin),
        groupKey: [bin],
        expanded: true,
        canExpand: true,
        cells: { items: stock.length, quantity: null, reorder_point: null },
    }
    const details: ResultRow[] = stock
        .map(row => ({ row, item: inventoryItem(row.product) }))
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map(({ row, item }) => ({
            id: `d:${row.id}`,
            kind: 'detail',
            depth: 1,
            label: `${item.code} · ${item.name}`,
            section: groupId,
            open: `books/products/${item.id}`,
            cells: {
                items: null,
                quantity: row.quantity,
                reorder_point: item.reorder_point > 0 ? item.reorder_point : null,
            },
        }))
    return [group, ...details]
}

const STOCK_BY_BIN_RESOLVED: ResolvedParam[] = [
    { id: 'bins', type: 'choice', unset: true },
    { id: 'order', type: 'choice', value: 'name' },
]

export function stockByBinResult(): RunResult {
    return {
        columns: STOCK_BY_BIN_COLUMNS,
        rows: reportBins().flatMap(binRows),
        notices: [],
        headerLines: [],
        topics: [
            'collection/books_bin_stock',
            'collection/books_bins',
            'collection/books_products',
        ],
        heading: STOCK_BY_BIN_HEADING,
        page: null,
        params: STOCK_BY_BIN_RESOLVED,
    }
}

export function emptyStockByBinResult(): RunResult {
    return { ...stockByBinResult(), rows: [] }
}
