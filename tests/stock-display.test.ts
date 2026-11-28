import { describe, expect, it } from 'vitest'
import {
    INVENTORY_ITEM_IDS,
    inventoryItem,
    SEED_STOCK,
    type StockLayerRecord,
    stockLayersOf,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import {
    averageCost,
    itemFigures,
    nextFifoCost,
    quantityText,
} from '../tinycld/books/lib/stock-display'

// The item page's figures (inventory-adjust spec §3.6 "Figures"): On hand, On PO, Stock
// value, and Average cost or Next cost (FIFO) by the book's costing method.

const DASH = '—'
const MINUS = '−'

function layer(id: string, quantity: number, value: number, position: number): StockLayerRecord {
    return { id, product: 'p', move: `m${id}`, date: '2026-07-01', quantity, value, position }
}

describe('quantityText', () => {
    it('shows at most 2 decimals and no trailing zeros', () => {
        expect(quantityText(36)).toBe('36')
        expect(quantityText(18.5)).toBe('18.5')
        expect(quantityText(2.25)).toBe('2.25')
    })

    it('shows a quantity below zero with the minus sign', () => {
        expect(quantityText(-1.5)).toBe(`${MINUS}1.5`)
    })
})

describe('averageCost', () => {
    it('is the stock value over the quantity on hand, in whole cents', () => {
        expect(averageCost(41_400, 36)).toBe(1_150)
        // 33.33… cents: the shared money helper rounds to 33.
        expect(averageCost(100, 3)).toBe(33)
    })

    it('is null when nothing is on hand, or less than nothing', () => {
        expect(averageCost(41_400, 0)).toBeNull()
        expect(averageCost(-2_300, -2)).toBeNull()
    })
})

describe('nextFifoCost', () => {
    it("is the oldest open layer's value over its quantity", () => {
        // The labels' opening layer: 12 at 138.00 → 11.50.
        expect(nextFifoCost(stockLayersOf(INVENTORY_ITEM_IDS.labels))).toBe(1_150)
        // The scanner's first receipt: 2 left at 128.00 → 64.00.
        expect(nextFifoCost(stockLayersOf(INVENTORY_ITEM_IDS.scanner))).toBe(6_400)
    })

    it('rounds the unit cost to whole cents', () => {
        expect(nextFifoCost([layer('a', 3, 1_000, 1)])).toBe(333)
    })

    it('skips a layer with nothing left: it is not open', () => {
        expect(nextFifoCost([layer('a', 0, 0, 1), layer('b', 4, 2_600, 2)])).toBe(650)
    })

    it('is null with no layer', () => {
        expect(nextFifoCost([])).toBeNull()
    })
})

const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels)

// The labels as the seed leaves them: 36 on hand at 414.00, 0 on a purchase order.
const SEEDED_LABELS = {
    ...LABELS,
    ...SEED_STOCK[INVENTORY_ITEM_IDS.labels],
}

// After the seed's decrease of 4, the labels' one open layer is 36 at 414.00.
const LABEL_LAYERS = [layer('open', 36, 41_400, 1)]

const shape = (figures: ReturnType<typeof itemFigures>) =>
    figures.map(figure => [figure.testID, figure.label, figure.text])

describe('itemFigures', () => {
    it('gives On hand, On PO, Stock value and Next cost (FIFO) for a FIFO book', () => {
        const figures = itemFigures({ item: SEEDED_LABELS, costing: 'fifo', layers: LABEL_LAYERS })
        expect(shape(figures)).toEqual([
            ['item-figure-on-hand', 'On hand', '36'],
            ['item-figure-on-po', 'On PO', DASH],
            ['item-figure-stock-value', 'Stock value', '$414.00'],
            ['item-figure-cost', 'Next cost (FIFO)', '$11.50'],
        ])
    })

    it('labels the fourth figure Average cost for an average-cost book', () => {
        const item = { ...SEEDED_LABELS, quantity_on_hand: 3, stock_value: 100 }
        const figures = itemFigures({ item, costing: 'average', layers: [] })
        expect(shape(figures)[3]).toEqual(['item-figure-cost', 'Average cost', '$0.33'])
    })

    it('labels the fourth figure Cost with a dash while the costing method is not known', () => {
        const figures = itemFigures({ item: SEEDED_LABELS, costing: null, layers: LABEL_LAYERS })
        expect(shape(figures)[3]).toEqual(['item-figure-cost', 'Cost', DASH])
        expect(figures).toHaveLength(4)
    })

    it('shows the quantity on a purchase order when it is above 0', () => {
        const item = { ...SEEDED_LABELS, quantity_on_po: 6 }
        const figures = itemFigures({ item, costing: 'fifo', layers: LABEL_LAYERS })
        expect(shape(figures)[1]).toEqual(['item-figure-on-po', 'On PO', '6'])
    })

    it('gives four figures always, with a dash for a cost it cannot give', () => {
        const empty = { ...SEEDED_LABELS, quantity_on_hand: 0, stock_value: 0 }
        const fifo = itemFigures({ item: empty, costing: 'fifo', layers: [] })
        const average = itemFigures({ item: empty, costing: 'average', layers: [] })
        expect(shape(fifo)).toEqual([
            ['item-figure-on-hand', 'On hand', '0'],
            ['item-figure-on-po', 'On PO', DASH],
            ['item-figure-stock-value', 'Stock value', '$0.00'],
            ['item-figure-cost', 'Next cost (FIFO)', DASH],
        ])
        expect(average).toHaveLength(4)
        expect(shape(average)[3]).toEqual(['item-figure-cost', 'Average cost', DASH])
    })

    it('shows an on hand below zero with the minus sign, and no average cost for it', () => {
        const short = { ...SEEDED_LABELS, quantity_on_hand: -1.5, stock_value: -1_725 }
        const figures = itemFigures({ item: short, costing: 'average', layers: [] })
        expect(shape(figures)[0]).toEqual(['item-figure-on-hand', 'On hand', `${MINUS}1.5`])
        expect(shape(figures)[3]).toEqual(['item-figure-cost', 'Average cost', DASH])
    })
})
