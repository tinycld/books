import type { BooksProducts } from '../types'
import { centsToText, formatMoney } from './money'
import { recordCardHeight } from './party-list'
import { productTypeLabel } from './product-types'
import { codeFirst } from './record-code'
import { quantityText } from './stock-display'

// The columns the list reads; the fixture rows and the query's rows both carry them.
export type ProductListFields = Pick<
    BooksProducts,
    | 'id'
    | 'name'
    | 'code'
    | 'vendor_part_no'
    | 'sales_description'
    | 'type'
    | 'price'
    | 'cost'
    | 'purchases'
    | 'inactive'
    | 'currency'
    | 'quantity_on_hand'
    | 'low_stock'
>

type StockFields = Pick<ProductListFields, 'type' | 'quantity_on_hand' | 'low_stock'>
type PriceFields = Pick<ProductListFields, 'type' | 'price' | 'currency'> & StockFields
type CostFields = Pick<ProductListFields, 'type' | 'cost' | 'purchases' | 'currency'>

// Shared by the header and every row, so the columns line up. Code and Name shrink with
// an ellipsis but keep a minimum width, so neither collapses to blank: 72 + 120 + 120 +
// 112 + 112 + 44 and the row's 24 px padding make the table's 604 px minimum width.
export const PRODUCT_COLUMNS = {
    code: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 72 },
    name: { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 120 },
    type: { width: 120, flexShrink: 0 },
    price: { width: 112, flexShrink: 0 },
    cost: { width: 112, flexShrink: 0 },
    menu: { width: 44, flexShrink: 0 },
} as const

// Below this the table scrolls sideways.
export const PRODUCT_TABLE_MIN_WIDTH = 604

export const PRODUCT_ROW_HEIGHT = 56

// The bundle item picker offers this many products while not searching.
export const PRODUCT_PICKER_LIMIT = 50

// The picker's options: rows whose name, vendor part number or code holds the term, any case, those whose
// code starts with it first, the first 50 in the order given (the picker's query sorts
// them by name).
export function productPickerOptions<
    T extends Pick<ProductListFields, 'id' | 'name' | 'vendor_part_no'> & { code?: string },
>(rows: readonly T[], term: string): T[] {
    const needle = term.trim().toLowerCase()
    // A row can arrive without a vendor part number or a code; searching must not throw on it.
    const matches = (row: T) =>
        [row.name, row.vendor_part_no, row.code].some(value =>
            (value ?? '').toLowerCase().includes(needle)
        )
    return codeFirst(rows.filter(matches), term, row => row.code).slice(0, PRODUCT_PICKER_LIMIT)
}

// The server stamps `currency` on create, so an optimistic insert has none until the
// server answers; until then the amount shows without a currency symbol. The server
// stores whole cents only, so an amount that is not one shows blank rather than
// sending formatMoney's "invalid currency code" warning for a row that only lacks one.
function productMoneyText(cents: number, currency: string | undefined): string {
    if (currency) return formatMoney(cents, currency)
    if (Number.isSafeInteger(cents)) return centsToText(cents)
    return ''
}

// A bundle has no price of its own, and a price of 0 shows blank.
export function productPriceText(product: PriceFields): string {
    if (product.type === 'bundle' || product.price === 0) return ''
    return productMoneyText(product.price, product.currency)
}

// A cost shows only while purchasing is on; a bundle has none, and 0 shows blank.
export function productCostText(product: CostFields): string {
    if (product.type === 'bundle' || !product.purchases || product.cost === 0) return ''
    return productMoneyText(product.cost, product.currency)
}

function onHandText(product: StockFields): string {
    return `${quantityText(product.quantity_on_hand)} on hand`
}

/**
 * The second line of an Inventory row's Type cell (inventory-adjust spec §3.10): "36 on
 * hand", muted, or "Low · 3 on hand" as a warning while the server marks the item low
 * (`low_stock`). Every other type has no stock, so no line (null).
 */
export function productStockLine(
    product: StockFields
): { text: string; tone: 'muted' | 'warning' } | null {
    if (product.type !== 'inventory') return null
    if (product.low_stock) return { text: `Low · ${onHandText(product)}`, tone: 'warning' }
    return { text: onHandText(product), tone: 'muted' }
}

// The card's "Type · price" line; an Inventory card ends with its "· <n> on hand".
export function productTypeLine(product: PriceFields): string {
    const parts = [productTypeLabel(product.type), productPriceText(product)]
    if (product.type === 'inventory') parts.push(onHandText(product))
    return parts.filter(part => part !== '').join(' · ')
}

// Line 1 of a low Inventory card holds the Low stock badge (StatusBadge): a 16 px text-xs
// line inside py-0.5 (2 + 2) and a 1 px border (1 + 1). The text scales and the frame does
// not, so at font scale 1 the badge is 22 px, 2 px more than the name's 20 px line
// (party-list CARD_NAME_LINE_HEIGHT); from scale 1.5 the name's line is the taller.
const BADGE_TEXT_HEIGHT = 16
const BADGE_FRAME_HEIGHT = 6
const NAME_LINE_HEIGHT = 20

function lowBadgeExtraHeight(fontScale: number): number {
    const badge = BADGE_FRAME_HEIGHT + BADGE_TEXT_HEIGHT * fontScale
    return Math.max(0, badge - NAME_LINE_HEIGHT * fontScale)
}

// Whether a card draws the Low stock badge on line 1.
export function productShowsLowBadge(product: StockFields): boolean {
    return product.type === 'inventory' && product.low_stock
}

export function productCardHeight(
    product: Pick<ProductListFields, 'vendor_part_no' | 'code'> & PriceFields,
    fontScale = 1
): number {
    const text = recordCardHeight(
        [product.code, productTypeLine(product), product.vendor_part_no],
        fontScale
    )
    if (!productShowsLowBadge(product)) return text
    return text + lowBadgeExtraHeight(fontScale)
}
