import { describe, expect, it } from 'vitest'
import {
    INVENTORY_ITEM_IDS,
    STOCK_MOVES,
    type StockMoveRecord,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import { MOVE_CHIPS, moveKindsOf } from '../tinycld/books/lib/stock-move-chips'
import { moveTransactionText, stockSourcePath } from '../tinycld/books/lib/stock-move-link'

// The Transaction cell of a stock move on the item page, the document it opens, and the
// chips over the movements (inventory-adjust spec §3.6 "Stock tab").

type MoveText = Pick<StockMoveRecord, 'kind' | 'source' | 'document_number'>

function move(kind: StockMoveRecord['kind'], source: string, document_number: string): MoveText {
    return { kind, source, document_number }
}

describe('moveTransactionText', () => {
    it("is the document kind's word and the document's number", () => {
        expect(moveTransactionText(move('sale', 'books_invoices', '1042'))).toBe('Invoice 1042')
        expect(moveTransactionText(move('receipt', 'books_bills', '318'))).toBe('Bill 318')
        expect(moveTransactionText(move('adjustment', 'books_inventory_adjustments', '12'))).toBe(
            'Inventory adjustment 12'
        )
        expect(moveTransactionText(move('sale', 'books_sales_receipts', '2007'))).toBe(
            'Sales receipt 2007'
        )
        expect(moveTransactionText(move('customer_return', 'books_credit_memos', '3003'))).toBe(
            'Credit memo 3003'
        )
        expect(moveTransactionText(move('vendor_return', 'books_vendor_credits', '12'))).toBe(
            'Vendor credit 12'
        )
    })

    it('reads "Opening stock" for an opening move, whatever its number', () => {
        expect(moveTransactionText(move('opening', 'books_inventory_adjustments', 'IA-1'))).toBe(
            'Opening stock'
        )
        expect(moveTransactionText(move('opening', 'books_inventory_adjustments', ''))).toBe(
            'Opening stock'
        )
    })

    it('is the word alone when the document has no number', () => {
        expect(moveTransactionText(move('receipt', 'books_bills', ''))).toBe('Bill')
        expect(moveTransactionText(move('adjustment', 'books_inventory_adjustments', ''))).toBe(
            'Inventory adjustment'
        )
    })

    it('names every move of the fixture', () => {
        const labels = STOCK_MOVES.filter(row => row.product === INVENTORY_ITEM_IDS.labels).map(
            moveTransactionText
        )
        expect(labels).toEqual([
            'Opening stock',
            'Invoice 1042',
            'Bill 318',
            'Sales receipt 2007',
            'Credit memo 3003',
            'Vendor credit 12',
            'Inventory adjustment IA-5',
        ])
    })
})

describe('stockSourcePath', () => {
    const ROUTES: Record<string, string> = {
        books_inventory_adjustments: 'books/inventory-adjustments',
        books_invoices: 'books/invoices',
        books_bills: 'books/bills',
        books_sales_receipts: 'books/sales-receipts',
        books_credit_memos: 'books/credit-memos',
        books_vendor_credits: 'books/vendor-credits',
    }

    it('opens the document of each source collection a stock move has', () => {
        const sources = [...new Set(STOCK_MOVES.map(row => row.source))].sort()
        expect(sources).toEqual(Object.keys(ROUTES).sort())
        for (const row of STOCK_MOVES) {
            expect(stockSourcePath(row.source, row.document), row.id).toBe(
                `${ROUTES[row.source]}/${row.document}`
            )
        }
    })

    it('opens nothing for an unknown collection', () => {
        expect(stockSourcePath('books_unknown_things', 'x1')).toBeNull()
    })
})

describe('MOVE_CHIPS', () => {
    it('are All, Receipts, Sales, Returns and Adjustments, in that order', () => {
        expect(MOVE_CHIPS.map(chip => chip.label)).toEqual([
            'All',
            'Receipts',
            'Sales',
            'Returns',
            'Adjustments',
        ])
    })
})

describe('moveKindsOf', () => {
    const kindsOf = (label: string) => {
        const chip = MOVE_CHIPS.find(row => row.label === label)
        if (!chip) throw new Error(`no chip ${label}`)
        const kinds = moveKindsOf(chip.id)
        return kinds === null ? null : [...kinds].sort()
    }

    it('keeps the receipts under Receipts and the sales under Sales', () => {
        expect(kindsOf('Receipts')).toEqual(['receipt'])
        expect(kindsOf('Sales')).toEqual(['sale'])
    })

    it('keeps both kinds of return under Returns', () => {
        expect(kindsOf('Returns')).toEqual(['customer_return', 'vendor_return'])
    })

    it('keeps the adjustments and the opening stock under Adjustments', () => {
        expect(kindsOf('Adjustments')).toEqual(['adjustment', 'opening'])
    })

    it('filters nothing under All', () => {
        expect(kindsOf('All')).toBeNull()
    })

    it('gives every kind of stock move one chip other than All', () => {
        const kinds = MOVE_CHIPS.filter(chip => chip.label !== 'All').flatMap(
            chip => moveKindsOf(chip.id) ?? []
        )
        expect([...kinds].sort()).toEqual([
            'adjustment',
            'customer_return',
            'opening',
            'receipt',
            'sale',
            'vendor_return',
        ])
    })
})
