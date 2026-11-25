import type { BooksProducts } from '../types'
import { centsToText, formatMoney } from './money'
import { recordCardHeight } from './party-list'
import { productTypeLabel } from './product-types'
import { codeFirst } from './record-code'

// The columns the list reads; the fixture rows and the query's rows both carry them.
export type ProductListFields = Pick<
    BooksProducts,
    | 'id'
    | 'name'
    | 'code'
    | 'sku'
    | 'sales_description'
    | 'type'
    | 'price'
    | 'cost'
    | 'purchases'
    | 'inactive'
    | 'currency'
>

type PriceFields = Pick<ProductListFields, 'type' | 'price' | 'currency'>
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

// The picker's options: rows whose name, SKU or code holds the term, any case, those whose
// code starts with it first, the first 50 in the order given (the picker's query sorts
// them by name).
export function productPickerOptions<
    T extends Pick<ProductListFields, 'id' | 'name' | 'sku'> & { code?: string },
>(rows: readonly T[], term: string): T[] {
    const needle = term.trim().toLowerCase()
    // A row can arrive without a SKU or a code; searching must not throw on it.
    const matches = (row: T) =>
        [row.name, row.sku, row.code].some(value => (value ?? '').toLowerCase().includes(needle))
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

// The card's "Type · price" line.
export function productTypeLine(product: PriceFields): string {
    const label = productTypeLabel(product.type)
    const price = productPriceText(product)
    if (price === '') return label
    return `${label} · ${price}`
}

export function productCardHeight(
    product: Pick<ProductListFields, 'type' | 'price' | 'currency' | 'sku' | 'code'>,
    fontScale = 1
): number {
    return recordCardHeight([product.code, productTypeLine(product), product.sku], fontScale)
}
