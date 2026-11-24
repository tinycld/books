import { describe, expect, it } from 'vitest'
import { quantitySold, STOCK_WARNING_KINDS, stockWarning } from '~/tinycld/books/lib/stock-warning'

const widget = { type: 'inventory', quantity_on_hand: 3 } as const

describe('stockWarning', () => {
    it('is null while the quantity on hand covers the sale', () => {
        expect(stockWarning(widget, 2)).toBeNull()
        expect(stockWarning(widget, 3)).toBeNull()
    })

    it('names the quantity on hand when the sale is more', () => {
        expect(stockWarning(widget, 3.01)).toBe(
            'Quantity on hand is 3. You can post this sale; the quantity on hand goes below zero.'
        )
    })

    it('shows the minus sign of an item that is oversold already', () => {
        expect(stockWarning({ type: 'inventory', quantity_on_hand: -1.5 }, 1)).toBe(
            'Quantity on hand is -1.5. You can post this sale; the quantity on hand goes below zero.'
        )
    })

    it('is null for a line with no quantity', () => {
        expect(stockWarning({ type: 'inventory', quantity_on_hand: 0 }, 0)).toBeNull()
    })

    it('is null for a product that holds no stock, and before the product is read', () => {
        expect(stockWarning({ type: 'service', quantity_on_hand: 0 }, 5)).toBeNull()
        expect(stockWarning({ type: 'non_inventory', quantity_on_hand: 0 }, 5)).toBeNull()
        expect(stockWarning(undefined, 5)).toBeNull()
    })

    it('counts the quantity a corrected document already took as stock', () => {
        expect(stockWarning(widget, 5, 2)).toBeNull()
        expect(stockWarning(widget, 5.01, 2)).toBe(
            'Quantity on hand is 3. You can post this sale; the quantity on hand goes below zero.'
        )
        expect(stockWarning(widget, 4, -9)).not.toBeNull()
    })

    it('compares in hundredths, so 0.1 + 0.2 on hand covers 0.3', () => {
        expect(stockWarning({ type: 'inventory', quantity_on_hand: 0.1 + 0.2 }, 0.3)).toBeNull()
    })
})

describe('quantitySold', () => {
    const rows = [
        { id: 'a', product: 'p1', quantity: 1.1 },
        { id: 'b', product: 'p2', quantity: 9 },
        { id: 'c', product: 'p1', quantity: 2.2 },
        { id: 'd', product: 'p1', quantity: null },
        { id: 'e', product: 'p1', quantity: -4 },
    ]

    it('adds the lines of the one product', () => {
        expect(quantitySold(rows, 'p1')).toBe(3.3)
        expect(quantitySold(rows, 'p2')).toBe(9)
    })

    it('is 0 for no product, an unknown product, and a value that is no row list', () => {
        expect(quantitySold(rows, '')).toBe(0)
        expect(quantitySold(rows, 'p9')).toBe(0)
        expect(quantitySold(undefined, 'p1')).toBe(0)
    })
})

describe('STOCK_WARNING_KINDS', () => {
    it('holds the two documents that sell stock, and no return or purchase', () => {
        expect(STOCK_WARNING_KINDS).toEqual(['invoice', 'sales_receipt'])
    })
})
