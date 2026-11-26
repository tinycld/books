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
    code: optionalText,
    vendor_part_no: optionalText,
    sales_description: optionalText,
    price: z.number().optional(),
    income_account: optionalText,
    taxable: z.boolean().optional(),
    purchases: z.boolean().optional(),
    purchase_description: optionalText,
    cost: z.number().optional(),
    expense_account: optionalText,
    asset_account: optionalText,
    preferred_vendor: optionalText,
    opening_quantity: z.number().optional(),
    opening_value: z.number().optional(),
    opening_date: optionalText,
    reorder_point: z.number().optional(),
})

export type ProductColumns = z.infer<typeof productColumnsSchema>

// What a bundle stores in the columns it does not use: the server refuses a bundle
// with a price, cost, account, purchase field or Taxable of its own. A new
// Non-inventory item switched to Bundle still holds Taxable on in its hidden toggle.
const BUNDLE_EMPTY_COLUMNS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
    ['price', 0],
    ['cost', 0],
    ['income_account', ''],
    ['expense_account', ''],
    ['purchase_description', ''],
    ['purchases', false],
    ['taxable', false],
])

const MONEY_KEYS: ReadonlySet<string> = new Set(['price', 'cost', 'opening_value'])

// Books counts these from the posted transactions; the server refuses a write of them
// ("Books sets the quantity on hand and the stock value itself."). The form shows the
// quantity on hand as text, so its value can reach a save only as what was loaded.
const SERVER_OWNED_KEYS: ReadonlySet<string> = new Set(['quantity_on_hand', 'stock_value'])

const isMoneyText = (key: string, value: unknown) =>
    MONEY_KEYS.has(key) && typeof value !== 'number'

/**
 * The columns to write for a product of `type`. A money field hidden at save (Cost
 * while purchasing is off) is not validated and may still hold the text its input
 * sent, so a `price`, `cost` or `opening_value` that is not a number is dropped and the
 * stored value stays. A bundle's own price, cost, accounts and purchase fields are
 * written empty, whatever the hidden fields hold; a key the form did not send stays
 * absent, so an edit that changed only the name sends only the name. The quantity on
 * hand and the stock value are never written.
 */
export function productColumnsFor(
    type: ProductType,
    columns: Record<string, unknown>
): ColumnsParse<ProductColumns> {
    const written = Object.entries(columns)
        .filter(([key, value]) => !SERVER_OWNED_KEYS.has(key) && !isMoneyText(key, value))
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
    code: '',
    vendor_part_no: '',
    sales_description: '',
    price: 0,
    income_account: '',
    taxable: false,
    purchases: false,
    purchase_description: '',
    cost: 0,
    expense_account: '',
    asset_account: '',
    preferred_vendor: '',
    opening_quantity: 0,
    opening_value: 0,
    opening_date: '',
    reorder_point: 0,
}

// The base of an insert, so a column the form left out is stored empty. The `satisfies`
// makes tsc refuse it when a parsed column, `type` above all, drifts from the
// generated row.
export const EMPTY_PRODUCT_COLUMNS: Required<ProductColumns> & { inactive: boolean } = {
    ...EMPTY_PRODUCT_FIELDS,
    inactive: false,
} satisfies Partial<BooksProducts>
