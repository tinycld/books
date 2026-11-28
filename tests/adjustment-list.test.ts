import { describe, expect, it } from 'vitest'
import {
    ADJUSTMENT_TABLE_MIN_WIDTH,
    adjustmentCardDetail,
    adjustmentItemsText,
    adjustmentListFilter,
    adjustmentRowText,
} from '../tinycld/books/lib/adjustment-list'
import {
    ADJUSTMENT_IDS,
    adjustmentOf,
    INVENTORY_ITEM_IDS,
    inventoryItem,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import { formatDay } from '../tinycld/books/lib/register-range'

// The inventory adjustments list (inventory-adjust spec §3.5): the Items cell, the chips'
// filters, the table's minimum width and a card's second line.

const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels).name

describe('adjustmentItemsText', () => {
    it("is the first line's item name, with + n more for the other lines", () => {
        expect(adjustmentItemsText(LABELS, 1)).toBe(LABELS)
        expect(adjustmentItemsText(LABELS, 2)).toBe(`${LABELS} + 1 more`)
        expect(adjustmentItemsText(LABELS, 3)).toBe(`${LABELS} + 2 more`)
    })

    it('is empty for an adjustment with no line', () => {
        expect(adjustmentItemsText(undefined, 0)).toBe('')
    })

    it('names a first line whose item row is gone "Deleted item"', () => {
        expect(adjustmentItemsText(undefined, 1)).toBe('Deleted item')
        expect(adjustmentItemsText(undefined, 3)).toBe('Deleted item + 2 more')
    })
})

type ListRow = Parameters<typeof adjustmentRowText>[0]

// A list row as useAdjustmentsQuery gives it, for the fixture's adjustment `id`.
function listRow(id: string, over: Partial<ListRow> = {}): ListRow {
    const row = adjustmentOf(id)
    return {
        id: row.id,
        status: row.status,
        kind: row.kind,
        number: row.number,
        date: row.date,
        value_change: row.value_change,
        currency: row.currency,
        accountRow: { number: '6110', name: 'Inventory shrinkage' },
        lines: [],
        firstItemName: LABELS,
        lineCount: 2,
        ...over,
    }
}

describe('adjustmentRowText', () => {
    it('reads the date, number, account and the posted value of a posted adjustment', () => {
        const text = adjustmentRowText(listRow(ADJUSTMENT_IDS.posted))
        expect(text.date).toBe(formatDay('2026-11-03'))
        expect(text.number).toBe('IA-5')
        expect(text.account).toBe('6110 Inventory shrinkage')
        expect(text.value).toBe('$90.00')
    })

    it("shows a void adjustment's value at the post", () => {
        expect(adjustmentRowText(listRow(ADJUSTMENT_IDS.replaced)).value).toBe('−$34.50')
    })

    it('shows a dash for the number and the value of a draft', () => {
        const text = adjustmentRowText(listRow(ADJUSTMENT_IDS.draft, { value_change: 500 }))
        expect(text.number).toBe('—')
        expect(text.value).toBe('—')
    })

    it('leaves the account empty when its row is gone', () => {
        const text = adjustmentRowText(listRow(ADJUSTMENT_IDS.posted, { accountRow: undefined }))
        expect(text.account).toBe('')
    })
})

// Sorted, so the order a filter lists its values in does not matter.
function filterOf(...args: Parameters<typeof adjustmentListFilter>) {
    const filter = adjustmentListFilter(...args)
    return { statuses: [...filter.statuses].sort(), kinds: [...filter.kinds].sort() }
}

describe('adjustmentListFilter', () => {
    it('lists the manual adjustments of every status under All', () => {
        expect(filterOf('all', false)).toEqual({
            statuses: ['draft', 'posted', 'void'],
            kinds: ['manual'],
        })
    })

    it('lists the manual adjustments of one status under Draft, Posted and Void', () => {
        for (const status of ['draft', 'posted', 'void'] as const) {
            expect(filterOf(status, false)).toEqual({ statuses: [status], kinds: ['manual'] })
        }
    })

    it('adds the opening and re-cost adjustments while Made by Books is on', () => {
        expect(filterOf('all', true)).toEqual({
            statuses: ['draft', 'posted', 'void'],
            kinds: ['manual', 'opening', 'recost'],
        })
        expect(filterOf('posted', true)).toEqual({
            statuses: ['posted'],
            kinds: ['manual', 'opening', 'recost'],
        })
    })
})

describe('the adjustments table', () => {
    // Date 108 + No. 72 + Items 160 + Account 150 + Value change 116 + Status 96 + row menu
    // 44 + edges 8: a table in the 956 px list of a 1280 window, cards in the 700 px of 1024.
    it('needs 754 px', () => {
        expect(ADJUSTMENT_TABLE_MIN_WIDTH).toBe(754)
    })
})

describe('adjustmentCardDetail', () => {
    it('reads "<number> · <date>"', () => {
        const posted = adjustmentOf(ADJUSTMENT_IDS.posted)
        expect(adjustmentCardDetail(posted)).toBe(`IA-5 · ${formatDay('2026-11-03')}`)
    })
})
