import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import {
    ADJUSTMENT_IDS,
    ADJUSTMENT_LINES,
    ADJUSTMENTS,
    adjustmentOf,
    BIN_IDS,
    BIN_STOCK,
    BINS,
    INVENTORY_ITEM_IDS,
    INVENTORY_ITEMS,
    INVENTORY_PRINTER,
    INVENTORY_TEXTS,
    inventoryItem,
    NO_BIN,
    NO_BIN_LABEL,
    SEED_ADJUSTMENT_IDS,
    SEED_BIN_STOCK,
    SEED_DRAFT_MEMO,
    SEED_POSTED_MEMO,
    SEED_STOCK,
    STOCK_BY_BIN_DESCRIPTION,
    STOCK_BY_BIN_DISPLAY,
    STOCK_BY_BIN_PARAMS,
    STOCK_BY_BIN_TITLE,
    STOCK_MOVES,
    stockByBinResult,
} from '~/tinycld/books/lib/inventory-adjust-fixture'
import { recordCodeSchema } from '~/tinycld/books/lib/record-code'
import { SEED_ACCOUNTS } from '~/tinycld/books/lib/seed-accounts'
import { seedInventory } from '~/tinycld/books/seed'

// Inventory-adjust spec §4 Seed and checkpoint 2 Do step 5: what the server makes of the
// seeded bins, items, bills, adjustments and move between bins. SEED_STOCK is keyed by item
// id; SEED_BIN_STOCK holds one row for each item and bin ('' is No bin).

const hundredths = (quantity: number) => Math.round(quantity * 100)

const seededItemIds = () => Object.keys(SEED_STOCK).sort()

function seedBinQuantities(product: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const row of SEED_BIN_STOCK) {
        if (row.product !== product) continue
        expect(out[row.bin], `two rows of ${product} in bin "${row.bin}"`).toBeUndefined()
        out[row.bin] = row.quantity
    }
    return out
}

// The three receipts of the scanner's FIFO history (SEED_RECEIPTS posts them as bills).
const scannerReceipts = STOCK_MOVES.filter(
    move => move.product === INVENTORY_ITEM_IDS.scanner && move.kind === 'receipt'
)
const receivedQuantity = scannerReceipts.reduce((sum, move) => sum + move.quantity, 0)
const receivedValue = scannerReceipts.reduce((sum, move) => sum + move.value, 0)

describe('inventory-adjust seed fixture', () => {
    it('seeds the four Inventory items beside the label printer', () => {
        expect(seededItemIds()).toEqual(INVENTORY_ITEMS.map(item => item.id).sort())
    })

    it("adds each item's SEED_BIN_STOCK quantities up to its quantity on hand", () => {
        for (const id of seededItemIds()) {
            const inBins = Object.values(seedBinQuantities(id)).reduce(
                (sum, quantity) => sum + hundredths(quantity),
                0
            )
            expect(inBins, id).toBe(hundredths(SEED_STOCK[id]?.quantity_on_hand ?? Number.NaN))
        }
    })

    it('holds the quantities and values the seeded documents leave', () => {
        expect(scannerReceipts.map(move => [move.date, move.quantity, move.value])).toEqual([
            ['2026-08-12', 6, 38_400],
            ['2026-09-30', 6, 39_900],
            ['2026-11-04', 4, 27_200],
        ])
        expect(SEED_STOCK).toEqual({
            // 40 at 460.00 less 4 at the FIFO cost of 11.50.
            [INVENTORY_ITEM_IDS.labels]: {
                quantity_on_hand: 36,
                stock_value: 41_400,
                low_stock: false,
            },
            [INVENTORY_ITEM_IDS.paperRoll]: {
                quantity_on_hand: 3,
                stock_value: 585,
                low_stock: true,
            },
            [INVENTORY_ITEM_IDS.tape]: {
                quantity_on_hand: 18.5,
                stock_value: 97_125,
                low_stock: false,
            },
            // The three receipts plus 2 at 136.00.
            [INVENTORY_ITEM_IDS.scanner]: {
                quantity_on_hand: receivedQuantity + 2,
                stock_value: receivedValue + 13_600,
                low_stock: false,
            },
        })
        expect(seedBinQuantities(INVENTORY_ITEM_IDS.labels)).toEqual({
            [BIN_IDS.aisle3]: 32,
            [BIN_IDS.frontCounter]: 4,
        })
        expect(seedBinQuantities(INVENTORY_ITEM_IDS.paperRoll)).toEqual({
            [BIN_IDS.frontCounter]: 3,
        })
        expect(seedBinQuantities(INVENTORY_ITEM_IDS.scanner)).toEqual({
            [BIN_IDS.aisle3]: receivedQuantity,
            [BIN_IDS.backRoom]: 2,
        })
        expect(seedBinQuantities(INVENTORY_ITEM_IDS.tape)).toEqual({ [NO_BIN]: 18.5 })
    })

    it('makes the paper roll, and only it, low from its opening stock of 3 at 5.85', () => {
        const low = seededItemIds().filter(id => SEED_STOCK[id]?.low_stock === true)
        expect(low).toEqual([INVENTORY_ITEM_IDS.paperRoll])
        const paperRoll = INVENTORY_ITEMS.find(item => item.id === INVENTORY_ITEM_IDS.paperRoll)
        expect([paperRoll?.opening_quantity, paperRoll?.opening_value]).toEqual([3, 585])
    })

    it('writes the replaced, the posted and the draft adjustment, found by their memos', () => {
        expect([...Object.values(SEED_ADJUSTMENT_IDS)].sort()).toEqual(
            [ADJUSTMENT_IDS.replaced, ADJUSTMENT_IDS.posted, ADJUSTMENT_IDS.draft].sort()
        )
        expect(SEED_POSTED_MEMO).toBe(adjustmentOf(ADJUSTMENT_IDS.posted).memo)
        expect(SEED_DRAFT_MEMO).toBe(adjustmentOf(ADJUSTMENT_IDS.draft).memo)
        expect(SEED_POSTED_MEMO).not.toBe(SEED_DRAFT_MEMO)
    })

    // Cp 2 fix r1 item 5: an adjustment row of the fixture carries the number the server
    // gives it, the number its stock moves carry (stampStockMoveNumbers).
    it('numbers each adjustment as the server does, as its stock moves carry it', () => {
        const adjustmentMoves = STOCK_MOVES.filter(
            move =>
                move.source === 'books_inventory_adjustments' &&
                ADJUSTMENTS.some(row => row.id === move.document)
        )
        expect(adjustmentMoves.map(move => move.document)).toContain(ADJUSTMENT_IDS.opening)
        expect(adjustmentMoves.map(move => move.document)).toContain(ADJUSTMENT_IDS.posted)
        for (const move of adjustmentMoves) {
            expect(move.document_number, move.id).toBe(adjustmentOf(move.document).number)
        }
        // seedInventory posts the three openings (IA-1 to IA-3), then these.
        expect([
            adjustmentOf(SEED_ADJUSTMENT_IDS.replaced).number,
            adjustmentOf(SEED_ADJUSTMENT_IDS.posted).number,
            adjustmentOf(SEED_ADJUSTMENT_IDS.draft).number,
        ]).toEqual(['IA-4', 'IA-5', ''])
    })

    it('keeps the reference-only adjustments on numbers no seeded document uses', () => {
        const seededNumbers = new Set<string>([
            ...STOCK_MOVES.map(move => move.document_number),
            'IA-1',
            'IA-2',
            'IA-3',
            ...Object.values(SEED_ADJUSTMENT_IDS).map(id => adjustmentOf(id).number),
        ])
        for (const id of [ADJUSTMENT_IDS.recost, ADJUSTMENT_IDS.noValue]) {
            const number = adjustmentOf(id).number
            expect(number, id).not.toBe('')
            expect(seededNumbers.has(number), `${id} takes the seeded number ${number}`).toBe(false)
        }
    })

    it("names the adjustment's number in the void confirmation, under its title", () => {
        // One sentence for every adjustment (spec §3.4 "Void: confirm …"): the hook, the
        // dialog and the e2e spec read it from here.
        expect(INVENTORY_TEXTS.voidBody('IA-5')).toBe(
            'Void inventory adjustment IA-5? Its stock change is taken back.'
        )
        expect(INVENTORY_TEXTS.voidBody(adjustmentOf(ADJUSTMENT_IDS.posted).number)).toBe(
            `Void inventory adjustment ${adjustmentOf(ADJUSTMENT_IDS.posted).number}? Its stock change is taken back.`
        )
        expect(INVENTORY_TEXTS.voidTitle).toBe('Void inventory adjustment')
    })

    it('names a seeded item and an active-at-seed bin or No bin on each seeded line', () => {
        const seeded = new Set<string>(Object.values(SEED_ADJUSTMENT_IDS))
        const lines = ADJUSTMENT_LINES.filter(line => seeded.has(line.adjustment))
        // Back room is active until the seed's last write makes it inactive.
        const binsAtSeed = new Set<string>([...Object.values(BIN_IDS), NO_BIN])
        const items = new Set(seededItemIds())
        for (const line of lines) {
            expect(items.has(line.product), `${line.id} names ${line.product}`).toBe(true)
            expect(binsAtSeed.has(line.bin), `${line.id} names bin ${line.bin}`).toBe(true)
            // A value change has no bin (server: "A value change has no bin.").
            if (line.quantity === 0) expect(line.bin, line.id).toBe(NO_BIN)
        }
        expect(lines.map(line => line.adjustment).sort()).toEqual(
            [
                ADJUSTMENT_IDS.replaced,
                ADJUSTMENT_IDS.posted,
                ADJUSTMENT_IDS.posted,
                ADJUSTMENT_IDS.draft,
                ADJUSTMENT_IDS.draft,
                ADJUSTMENT_IDS.draft,
                ADJUSTMENT_IDS.draft,
            ].sort()
        )
        const scannerIncrease = lines.find(line => line.id === 'ialnposted00002')
        expect([scannerIncrease?.quantity, scannerIncrease?.value, scannerIncrease?.bin]).toEqual([
            2,
            13_600,
            BIN_IDS.backRoom,
        ])
    })
})

// The seed's writes against the server's field rules. The fake PocketBase of
// tests/seed-node.test.ts applies none, so a value the server refuses (a code over 15
// characters stopped db:reset in checkpoint 2) passes every other unit test.

type SeedWrite = { op: 'create' | 'update'; collection: string; data: Record<string, unknown> }

// Records each write seedInventory sends; a create answers with the row it was sent, and
// a read (postSeedDocument reads the revision) with a row at revision 0.
function recordingPb() {
    const writes: SeedWrite[] = []
    let next = 0
    const collection = (name: string) => ({
        create: async (data: Record<string, unknown>) => {
            next += 1
            writes.push({ op: 'create', collection: name, data })
            const id =
                typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
            return { ...data, id }
        },
        update: async (id: string, data: Record<string, unknown>) => {
            writes.push({ op: 'update', collection: name, data })
            return { ...data, id }
        },
        getOne: async (id: string) => ({ id, revision: 0 }),
    })
    return { pb: { collection, filter: (raw: string) => raw }, writes }
}

// `books_bin_transfers` → `booksBinTransfersSchema`, generated from the migrations.
function schemaOf(collection: string) {
    const name = `${collection.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}Schema`
    const schema = (zodSchemas as Record<string, unknown>)[name]
    if (!(schema instanceof z.ZodObject)) throw new Error(`no generated schema ${name}`)
    return schema
}

// PocketBase reads '' in an optional field as blank (No bin, a code the server makes);
// the generated schema has no '' for a relation, so a blank value is left out.
function withoutBlanks(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ''))
}

function faultsOf(write: SeedWrite): string[] {
    const parsed = schemaOf(write.collection)
        .partial()
        .strict()
        .safeParse(withoutBlanks(write.data))
    if (parsed.success) return []
    return parsed.error.issues.map(
        issue =>
            `${write.op} ${write.collection} ${String(write.data.id ?? '')} ${issue.path.join('.')}: ${issue.message}`
    )
}

describe('inventory-adjust seed rows against the server rules', () => {
    it('gives every Inventory item a code the server accepts as it is', () => {
        for (const item of [...INVENTORY_ITEMS, INVENTORY_PRINTER]) {
            const parsed = recordCodeSchema.safeParse(item.code)
            expect(parsed.success ? '' : parsed.error.issues[0]?.message, item.id).toBe('')
            expect(parsed.data, `${item.id} code is normalized`).toBe(item.code)
            expect(item.code, `${item.id} names a code`).not.toBe('')
        }
    })

    it("sends each bin, item, bill, adjustment, line and transfer as a row of its collection's schema", async () => {
        const { pb, writes } = recordingPb()
        const accountIds = new Map(
            SEED_ACCOUNTS.map(account => [account.number, `acct${account.number}`.padEnd(15, '0')])
        )
        await seedInventory(
            pb as unknown as Parameters<typeof seedInventory>[0],
            { user: { id: 'usrseed00000001', email: 'seed@example.com', name: 'Seed' } },
            accountIds
        )
        expect([...new Set(writes.map(write => write.collection))].sort()).toEqual([
            'books_bill_lines',
            'books_bills',
            'books_bin_transfers',
            'books_bins',
            'books_inventory_adjustment_lines',
            'books_inventory_adjustments',
            'books_products',
        ])
        expect(writes.flatMap(faultsOf)).toEqual([])
    })
})

// The Go shipped report (server/report_bins.go) and this fixture hold the same title,
// description, empty text, params and display: both are compared with
// server/testdata/stock_by_bin_spec.json (TestStockByBinMatchesSharedSpecFile reads it too).
type StockByBinSpecFile = {
    title: string
    description: string
    emptyText: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

const stockByBinSpecFile: StockByBinSpecFile = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'stock_by_bin_spec.json'), 'utf8')
)

describe('Stock by Bin Location fixture against the shared spec file', () => {
    it('has the title, the description and the empty text the report ships with', () => {
        expect(STOCK_BY_BIN_TITLE).toBe(stockByBinSpecFile.title)
        expect(STOCK_BY_BIN_DESCRIPTION).toBe(stockByBinSpecFile.description)
        expect(INVENTORY_TEXTS.reportEmpty).toBe(stockByBinSpecFile.emptyText)
    })

    it('has the params and the display the report ships with', () => {
        expect(STOCK_BY_BIN_PARAMS).toEqual(stockByBinSpecFile.params)
        expect(STOCK_BY_BIN_DISPLAY).toEqual(stockByBinSpecFile.display)
    })

    // Spec §3.9 (cp9 fix r1 decision): below 420 px line 1 is the label alone, spanning
    // every track; line 2 is Items, Quantity and Reorder point, one track each.
    it('puts the label alone on line 1 of the phone layout, and the three figures on line 2', () => {
        const layouts = STOCK_BY_BIN_DISPLAY.layouts ?? []
        expect(layouts).toHaveLength(1)
        const [layout] = layouts
        expect(layout.width).toBe('mobile')
        expect(layout.tracks).toBe(3)
        // An absent or zero span is one track (core table-lines.ts `extent`).
        const placed = (cells: typeof layout.cells) =>
            cells.map(cell => [cell.col, Math.max(cell.span ?? 0, 1)])
        const line1 = layout.cells.filter(cell => cell.line === 1)
        const line2 = layout.cells.filter(cell => cell.line === 2)
        expect(placed(line1)).toEqual([['name', layout.tracks]])
        expect(placed(line2)).toEqual([
            ['items', 1],
            ['quantity', 1],
            ['reorder_point', 1],
        ])
        expect(line1.length + line2.length).toBe(layout.cells.length)
    })
})

// Spec §3.9: the label, Quantity and Reorder point, a bin row that counts its items, one
// group for each bin with stock ("No bin" last, " (inactive)" on an inactive bin), detail
// rows "<code> · <name>" that open the item, no row for a quantity of 0, no Total row.
describe('Stock by Bin Location fixture rows against the spec columns', () => {
    const result = stockByBinResult()
    const groups = result.rows.filter(row => row.kind === 'group')

    it('has the label, Items, Quantity and Reorder point columns, and the layout reads only them', () => {
        expect(result.columns.map(column => [column.id, column.label])).toEqual([
            ['name', 'Bin'],
            ['items', 'Items'],
            ['quantity', 'Quantity'],
            ['reorder_point', 'Reorder point'],
        ])
        const ids = new Set(result.columns.map(column => column.id))
        for (const layout of STOCK_BY_BIN_DISPLAY.layouts ?? []) {
            for (const cell of layout.cells) expect(ids.has(cell.col), cell.col).toBe(true)
        }
    })

    it('has bin and item rows only: no Total row', () => {
        for (const row of result.rows) expect(['group', 'detail']).toContain(row.kind)
    })

    it('labels each bin with stock, " (inactive)" on an inactive bin and No bin last', () => {
        const withStock = new Set(BIN_STOCK.filter(row => row.quantity !== 0).map(row => row.bin))
        expect(groups).toHaveLength(withStock.size)
        expect(groups.at(-1)?.label).toBe(NO_BIN_LABEL)
        for (const bin of BINS) {
            if (!withStock.has(bin.id)) continue
            const label = bin.inactive ? `${bin.name} (inactive)` : bin.name
            expect(groups.map(group => group.label)).toContain(label)
        }
    })

    it('counts the items of a bin row, with blank Quantity and Reorder point', () => {
        for (const group of groups) {
            const details = result.rows.filter(row => row.section === group.id)
            // The shipped report's text, "1 item" or "<n> items" (spec §3.9 "7 items").
            const count = details.length === 1 ? '1 item' : `${details.length} items`
            expect(group.cells.items, group.label).toBe(count)
            expect(group.cells.quantity, group.label).toBeNull()
            expect(group.cells.reorder_point, group.label).toBeNull()
            expect(group.expanded, group.label).toBe(true)
        }
    })

    it('labels an item row "<code> · <name>", opens the item, and has no row of quantity 0', () => {
        const details = result.rows.filter(row => row.kind === 'detail')
        expect(details.length).toBeGreaterThan(0)
        for (const row of details) {
            const id = (row.open ?? '').replace('books/products/', '')
            const item = inventoryItem(id)
            expect(row.label).toBe(`${item.code} · ${item.name}`)
            expect(row.cells.quantity).not.toBe(0)
            expect(row.cells.reorder_point).toBe(item.reorder_point > 0 ? item.reorder_point : null)
        }
    })
})
