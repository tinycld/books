import { describe, expect, it } from 'vitest'
import { stampOf } from '../tinycld/books/components/payments/read-view-parts'
import {
    adjustmentReadActions,
    adjustmentReadColumns,
    adjustmentReadMinWidth,
    adjustmentReadTotal,
    adjustmentReadTotalText,
    binLabel,
    booksMadeNotice,
    lineBinText,
    lineValueText,
    noEntryText,
    quantityChangeText,
    readLineCells,
} from '../tinycld/books/lib/adjustment-read'
import { formatDateTime } from '../tinycld/books/lib/entry-display'
import {
    ADJUSTMENT_IDS,
    type AdjustmentLineRecord,
    adjustmentLinesOf,
    adjustmentOf,
    BINS,
    INVENTORY_ITEM_IDS,
    INVENTORY_TEXTS,
    inventoryItem,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import { productPath } from '../tinycld/books/lib/product-route'
import { stockSourcePath, stockSourceWord } from '../tinycld/books/lib/stock-move-link'

// The inventory adjustment's read view (inventory-adjust spec §3.5): the value Books posted
// for each line (the line's `posted_value`, which the server writes at the post), the total,
// the notice of an adjustment Books made, the journal entry text, the stamps, the bin label
// and the read lines' columns.

const POSTED = adjustmentOf(ADJUSTMENT_IDS.posted)
const OPENING = adjustmentOf(ADJUSTMENT_IDS.opening)
const RECOST = adjustmentOf(ADJUSTMENT_IDS.recost)
const VOID = adjustmentOf(ADJUSTMENT_IDS.replaced)
const DRAFT = adjustmentOf(ADJUSTMENT_IDS.draft)

// A fixture line as the read view reads it: with its item's name (undefined when the item
// row is gone) and its bin row.
function readLine(line: AdjustmentLineRecord, productName: string | undefined) {
    const bin = BINS.find(row => row.id === line.bin)
    const binRow = bin ? { name: bin.name, inactive: bin.inactive } : undefined
    return { ...line, productName, binRow }
}

function readLinesOf(id: string) {
    return adjustmentLinesOf(id).map(line => readLine(line, inventoryItem(line.product).name))
}

describe('readLineCells', () => {
    it("takes each posted line's Value change from the value Books posted for the line", () => {
        // The decrease line stores no value: the costing method gave its cost, and only its
        // posted_value holds it.
        const lines = readLinesOf(ADJUSTMENT_IDS.posted)
        expect(lines.map(line => line.value)).toEqual([0, 13_600])
        const cells = readLineCells(lines, POSTED.status, POSTED.currency)
        expect(cells.map(cell => [cell.id, cell.value])).toEqual([
            ['ialnposted00001', '−$46.00'],
            ['ialnposted00002', '$136.00'],
        ])
        expect(cells.map(cell => cell.change)).toEqual(['−4', '+2'])
        expect(cells.map(cell => cell.bin)).toEqual(['Aisle 3, shelf B', 'Back room (inactive)'])
    })

    it("shows a void line's posted value: the void took its stock moves, not its value", () => {
        const cells = readLineCells(readLinesOf(ADJUSTMENT_IDS.replaced), VOID.status, 'USD')
        expect(cells.map(cell => cell.value)).toEqual(['−$34.50'])
    })

    it('shows a dash on every draft line, whose value Books has not posted', () => {
        const lines = readLinesOf(ADJUSTMENT_IDS.draft)
        // ialndraft000002 stores a revaluation of −12.50, which no post has made.
        expect(lines.some(line => line.value !== 0)).toBe(true)
        const cells = readLineCells(lines, DRAFT.status, DRAFT.currency)
        expect(cells.map(cell => cell.value)).toEqual(['—', '—', '—', '—'])
    })

    it('names a line whose item row is gone "Deleted item"', () => {
        const [first] = adjustmentLinesOf(ADJUSTMENT_IDS.posted)
        const cells = readLineCells([readLine(first, undefined)], POSTED.status, 'USD')
        expect(cells.map(cell => cell.item)).toEqual(['Deleted item'])
        expect(cells.map(cell => cell.value)).toEqual(['−$46.00'])
    })
})

describe('adjustmentReadTotal', () => {
    it("is the adjustment's value_change, not a sum the client makes", () => {
        expect(adjustmentReadTotal(POSTED)).toBe(9_000)
        expect(adjustmentReadTotal(RECOST)).toBe(1_200)
    })
})

describe('adjustmentReadTotalText', () => {
    it('shows the value at the post of a posted and of a void adjustment', () => {
        expect(adjustmentReadTotalText(POSTED)).toBe('$90.00')
        expect(adjustmentReadTotalText(VOID)).toBe('−$34.50')
    })

    it('shows a dash for a draft, which Books has posted nothing for', () => {
        expect(adjustmentReadTotalText({ ...DRAFT, value_change: 500 })).toBe('—')
        expect(adjustmentReadTotalText(DRAFT)).toBe('—')
    })
})

describe('the read stamps', () => {
    const at = '2026-11-27 13:48:00.000Z'

    it('reads "<Verb> by <name>, <date time>" with the name of the person', () => {
        expect(stampOf('Posted', 'Ana Ruiz', at)).toBe(`Posted by Ana Ruiz, ${formatDateTime(at)}`)
        expect(stampOf('Voided', 'Ana Ruiz', at)).toBe(`Voided by Ana Ruiz, ${formatDateTime(at)}`)
    })

    it('reads "<Verb> <date time>" with no "by" when no person posted or voided it', () => {
        expect(stampOf('Posted', undefined, at)).toBe(`Posted ${formatDateTime(at)}`)
        expect(stampOf('Posted', '', at)).toBe(`Posted ${formatDateTime(at)}`)
        expect(stampOf('Voided', undefined, at)).toBe(`Voided ${formatDateTime(at)}`)
    })

    it('is empty with no time', () => {
        expect(stampOf('Posted', 'Ana Ruiz', '')).toBe('')
        expect(stampOf('Posted', undefined, '')).toBe('')
    })
})

describe('booksMadeNotice', () => {
    it('names the item of an opening adjustment and links the item', () => {
        const itemName = inventoryItem(INVENTORY_ITEM_IDS.labels).name
        expect(booksMadeNotice(OPENING, { itemName, documentNumber: '' })).toEqual({
            text: INVENTORY_TEXTS.openingNotice,
            target: productPath(INVENTORY_ITEM_IDS.labels),
        })
    })

    it('names the document of a re-cost and links the document', () => {
        expect(booksMadeNotice(RECOST, { itemName: '', documentNumber: '318' })).toEqual({
            text: INVENTORY_TEXTS.recostNotice,
            target: 'books/bills/billstockmov318',
        })
    })

    it('gives a manual adjustment no notice', () => {
        expect(booksMadeNotice(POSTED, { itemName: 'Anything', documentNumber: '318' })).toBeNull()
    })
})

describe('adjustmentReadActions', () => {
    it('offers no Edit, Void or Copy on an adjustment Books made, even to a writer', () => {
        expect(adjustmentReadActions(OPENING, true)).toEqual([])
        expect(adjustmentReadActions(RECOST, true)).toEqual([])
    })

    it('offers Edit, Void and Copy on a posted manual adjustment to a writer', () => {
        expect(adjustmentReadActions(POSTED, true)).toEqual(
            expect.arrayContaining(['edit', 'void', 'copy'])
        )
    })
})

describe('noEntryText', () => {
    it('says the adjustment changed no value when a posted one has no entry', () => {
        expect(noEntryText({ status: 'posted', entry: '' })).toBe(INVENTORY_TEXTS.noEntry)
        expect(INVENTORY_TEXTS.noEntry).toBe('No journal entry: this adjustment changed no value.')
    })

    it('gives no text when the adjustment has an entry (the link shows)', () => {
        expect(noEntryText({ status: 'posted', entry: 'jrnlentry000001' })).toBeNull()
    })
})

describe('binLabel', () => {
    it('reads No bin, the name, and the name with (inactive)', () => {
        expect(binLabel(undefined)).toBe('No bin')
        expect(binLabel({ name: 'Aisle 3, shelf B', inactive: false })).toBe('Aisle 3, shelf B')
        expect(binLabel({ name: 'Back room', inactive: true })).toBe('Back room (inactive)')
    })
})

describe('lineValueText', () => {
    it("shows the line's posted value, with a minus sign for a decrease", () => {
        expect(lineValueText('posted', -4_600, 'USD')).toBe('−$46.00')
        expect(lineValueText('posted', 13_600, 'USD')).toBe('$136.00')
    })

    it('shows the posted value of a void line, which the void keeps', () => {
        expect(lineValueText('void', -3_450, 'USD')).toBe('−$34.50')
    })

    it('shows a dash on a draft line, whose value Books has not posted', () => {
        expect(lineValueText('draft', 0, 'USD')).toBe('—')
        expect(lineValueText('draft', -1_250, 'USD')).toBe('—')
    })
})

describe('quantityChangeText', () => {
    it('signs an increase with + and a decrease with the minus sign', () => {
        expect(quantityChangeText(2)).toBe('+2')
        expect(quantityChangeText(-4)).toBe('−4')
    })

    it('shows a dash for a line that changes only the value', () => {
        expect(quantityChangeText(0)).toBe('—')
    })

    it('shows at most 2 decimals', () => {
        expect(quantityChangeText(1.5)).toBe('+1.5')
        expect(quantityChangeText(-2.25)).toBe('−2.25')
        expect(quantityChangeText(1.004)).toBe('+1')
        expect(quantityChangeText(0.333333)).toBe('+0.33')
    })
})

describe('lineBinText', () => {
    it('shows a dash for a line that moves no stock', () => {
        expect(lineBinText(0, { name: 'Aisle 3, shelf B', inactive: false })).toBe('—')
        expect(lineBinText(0, undefined)).toBe('—')
    })

    it("shows the bin's label for a line that moves stock", () => {
        expect(lineBinText(-4, { name: 'Aisle 3, shelf B', inactive: false })).toBe(
            'Aisle 3, shelf B'
        )
        expect(lineBinText(2, { name: 'Back room', inactive: true })).toBe('Back room (inactive)')
        expect(lineBinText(2, undefined)).toBe('No bin')
    })
})

describe('the read lines columns', () => {
    it('are Item, Bin, Change and Value change, at least 588 px, while the book has a bin', () => {
        expect(adjustmentReadColumns(true).map(column => column.key)).toEqual([
            'item',
            'bin',
            'change',
            'value',
        ])
        expect(adjustmentReadMinWidth(true)).toBe(588)
    })

    it('have no Bin column and a 468 px minimum while the book has no bin', () => {
        expect(adjustmentReadColumns(false).map(column => column.key)).toEqual([
            'item',
            'change',
            'value',
        ])
        expect(adjustmentReadMinWidth(false)).toBe(588 - 120)
    })
})

describe('stock-move-link', () => {
    it("names a source collection by its doc type's label", () => {
        expect(stockSourceWord('books_bills')).toBe('Bill')
        expect(stockSourceWord('books_sales_receipts')).toBe('Sales receipt')
        expect(stockSourceWord('books_inventory_adjustments')).toBe('Inventory adjustment')
    })

    it('opens a source document on its route, and an unknown collection nowhere', () => {
        expect(stockSourcePath('books_bills', 'b1')).toBe('books/bills/b1')
        expect(stockSourcePath('books_inventory_adjustments', 'ia1')).toBe(
            'books/inventory-adjustments/ia1'
        )
        expect(stockSourcePath('books_unknown_things', 'x1')).toBeNull()
    })
})
