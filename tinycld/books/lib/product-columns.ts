import { z } from '@tinycld/core/ui/form'
import type { BooksProducts } from '../types'
import { PRODUCT_TYPE_KEYS, type ProductType } from './product-types'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in product columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the product does not have is refused.
 */
export const productColumnsSchema = z.strictObject({
    type: z.enum(PRODUCT_TYPE_KEYS).optional(),
    name: optionalText,
    sku: optionalText,
    sales_description: optionalText,
    price: z.number().optional(),
    income_account: optionalText,
    purchases: z.boolean().optional(),
    purchase_description: optionalText,
    cost: z.number().optional(),
    expense_account: optionalText,
})

export type ProductColumns = z.infer<typeof productColumnsSchema>

// What a bundle stores in the columns it does not use: the server refuses a bundle
// with a price, cost, account or purchase field of its own.
const BUNDLE_EMPTY_COLUMNS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
    ['price', 0],
    ['cost', 0],
    ['income_account', ''],
    ['expense_account', ''],
    ['purchase_description', ''],
    ['purchases', false],
])

const MONEY_KEYS: ReadonlySet<string> = new Set(['price', 'cost'])

const isMoneyText = (key: string, value: unknown) =>
    MONEY_KEYS.has(key) && typeof value !== 'number'

/**
 * The columns to write for a product of `type`. A money field hidden at save (Cost
 * while purchasing is off) is not validated and may still hold the text its input
 * sent, so a `price` or `cost` that is not a number is dropped and the stored value
 * stays. A bundle's own price, cost, accounts and purchase fields are written empty,
 * whatever the hidden fields hold; a key the form did not send stays absent, so an edit
 * that changed only the name sends only the name.
 */
export function productColumnsFor(
    type: ProductType,
    columns: Record<string, unknown>
): ColumnsParse<ProductColumns> {
    const written = Object.entries(columns)
        .filter(([key, value]) => !isMoneyText(key, value))
        .map(([key, value]) =>
            type === 'bundle' && BUNDLE_EMPTY_COLUMNS.has(key)
                ? [key, BUNDLE_EMPTY_COLUMNS.get(key)]
                : [key, value]
        )
    return parseColumns(productColumnsSchema, Object.fromEntries(written))
}

// Every form field of a new product, empty. The create form starts from these: a field
// with no starting value is added to react-hook-form's values as undefined when its
// input mounts, and then a value typed and deleted again never compares equal to the
// start, so the form would stay dirty.
export const EMPTY_PRODUCT_FIELDS: Required<ProductColumns> = {
    type: 'service',
    name: '',
    sku: '',
    sales_description: '',
    price: 0,
    income_account: '',
    purchases: false,
    purchase_description: '',
    cost: 0,
    expense_account: '',
}

// The base of an insert, so a column the form left out is stored empty. The `satisfies`
// makes tsc refuse it when a parsed column, `type` above all, drifts from the
// generated row.
export const EMPTY_PRODUCT_COLUMNS: Required<ProductColumns> & { inactive: boolean } = {
    ...EMPTY_PRODUCT_FIELDS,
    inactive: false,
} satisfies Partial<BooksProducts>
