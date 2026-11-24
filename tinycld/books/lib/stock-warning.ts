import type { BooksProducts } from '../types'
import { rowsOf } from './form-values'
import { quantityOnHandText } from './quantity-input'

// The warning under a sale line that sells more of an Inventory item than the quantity on
// hand (books design, "Inventory": negative stock). It never blocks Post: the sale posts
// at the last known cost, and the next receipt sets the cost right.

/** The sales document kinds whose lines take stock out. */
export const STOCK_WARNING_KINDS: readonly string[] = ['invoice', 'sales_receipt']

type StockProduct = Pick<BooksProducts, 'type' | 'quantity_on_hand'>

// Quantities carry two decimals; whole hundredths add with no float error.
function hundredths(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : 0
}

/**
 * The quantity of `productId` on all the Item lines of a line table, so two lines of one
 * item are counted together. A line with no quantity, or a quantity below zero, adds none.
 */
export function quantitySold(rows: unknown, productId: string): number {
    if (productId === '') return 0
    const total = rowsOf(rows)
        .filter(row => row.product === productId)
        .reduce((sum, row) => sum + Math.max(hundredths(row.quantity), 0), 0)
    return total / 100
}

/**
 * The warning text, or null when the product is no Inventory item or the stock covers the
 * sale. `held` is the quantity the posted document a correction replaces already took: it
 * is out of the quantity on hand and comes back when the correction posts, so it counts as
 * stock for the correction.
 */
export function stockWarning(
    product: StockProduct | undefined,
    quantity: number,
    held = 0
): string | null {
    if (product?.type !== 'inventory') return null
    const available = hundredths(product.quantity_on_hand) + Math.max(hundredths(held), 0)
    if (hundredths(quantity) <= available) return null
    const onHand = quantityOnHandText(product.quantity_on_hand)
    return `Quantity on hand is ${onHand}. You can post this sale; the quantity on hand goes below zero.`
}
