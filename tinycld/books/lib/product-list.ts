import type { BooksProducts } from '../types'
import { formatMoney } from './money'
import { recordCardHeight } from './party-list'
import { productTypeLabel } from './product-types'

// The columns the list reads; the fixture rows and the query's rows both carry them.
export type ProductListFields = Pick<
    BooksProducts,
    | 'id'
    | 'name'
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

// Shared by the header and every row, so the columns line up. Name shrinks with an
// ellipsis but keeps a minimum width, so it never collapses to blank: 148 + 120 + 112
// + 112 + 44 and the row's 24 px padding make the table's 560 px minimum width.
export const PRODUCT_COLUMNS = {
    name: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 148 },
    type: { width: 120, flexShrink: 0 },
    price: { width: 112, flexShrink: 0 },
    cost: { width: 112, flexShrink: 0 },
    menu: { width: 44, flexShrink: 0 },
} as const

// Below this the table scrolls sideways.
export const PRODUCT_TABLE_MIN_WIDTH = 560

export const PRODUCT_ROW_HEIGHT = 56

export function compareProductNames(
    a: Pick<ProductListFields, 'id' | 'name'>,
    b: Pick<ProductListFields, 'id' | 'name'>
): number {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

export function productMatches(
    product: Pick<ProductListFields, 'name' | 'sku' | 'sales_description'>,
    query: string
): boolean {
    const term = query.trim().toLowerCase()
    if (term === '') return true
    const fields = [product.name, product.sku, product.sales_description]
    // A row can arrive without a SKU or sales description; searching must not throw on it.
    return fields.some(value => (value ?? '').toLowerCase().includes(term))
}

// One flat list: inactive rows dropped unless shown, then matched, then sorted by name.
export function productRows<T extends ProductListFields>(
    records: readonly T[],
    filters: { query: string; showInactive: boolean }
): T[] {
    return records
        .filter(r => filters.showInactive || !r.inactive)
        .filter(r => productMatches(r, filters.query))
        .sort(compareProductNames)
}

// A bundle has no price of its own, and a price of 0 shows blank.
export function productPriceText(product: PriceFields): string {
    if (product.type === 'bundle' || product.price === 0) return ''
    return formatMoney(product.price, product.currency)
}

// A cost shows only while purchasing is on; a bundle has none, and 0 shows blank.
export function productCostText(product: CostFields): string {
    if (product.type === 'bundle' || !product.purchases || product.cost === 0) return ''
    return formatMoney(product.cost, product.currency)
}

// The card's "Type · price" line.
export function productTypeLine(product: PriceFields): string {
    const label = productTypeLabel(product.type)
    const price = productPriceText(product)
    if (price === '') return label
    return `${label} · ${price}`
}

export function productCardHeight(
    product: Pick<ProductListFields, 'type' | 'price' | 'currency' | 'sku'>,
    fontScale = 1
): number {
    return recordCardHeight([productTypeLine(product), product.sku], fontScale)
}
