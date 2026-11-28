import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'
import { hideBuiltins, requireBuiltins } from './form-definition'
import type { ProductType } from './product-types'

// The built-ins only an Inventory item has (the server refuses them on another type). The
// form has no Quantity on hand row: the item page's figures show it.
export const INVENTORY_BUILTINS = [
    'asset_account',
    'preferred_vendor',
    'opening_quantity',
    'opening_value',
    'opening_date',
    'reorder_point',
    'default_bin',
] as const

// While the book has no bin location, no screen shows a bin field (inventory-adjust spec
// §3.1), so Default bin hides.
const NO_BINS_HIDDEN_BUILTINS: readonly string[] = ['default_bin']

// Core form rules cannot test a custom built-in's value, so the form follows the
// product type by hiding these built-ins in a definition copy (spec Q4). A bundle has
// no Taxable of its own: its lines take their taxability from each item. An Inventory
// item is always purchased (the server turns `purchases` on), so its toggle is hidden
// and the purchase fields always show.
export const PRODUCT_HIDDEN_BUILTINS: Record<ProductType, readonly string[]> = {
    service: ['items', ...INVENTORY_BUILTINS],
    non_inventory: ['items', ...INVENTORY_BUILTINS],
    inventory: ['items', 'purchases'],
    bundle: [
        'price',
        'income_account',
        'taxable',
        'purchases',
        'purchase_description',
        'cost',
        'expense_account',
        ...INVENTORY_BUILTINS,
    ],
}

// The account an Inventory item's purchases and sales cost go to is its cost of goods
// sold account, held in `expense_account`.
export const COGS_ACCOUNT_LABEL = 'Cost of goods sold account'

export type ProductFormMode = 'new' | 'edit'

export const PRODUCT_REQUIRED_BUILTINS: Record<ProductType, readonly string[]> = {
    service: ['income_account'],
    non_inventory: ['income_account'],
    inventory: ['income_account'],
    bundle: [],
}

// The expense account of an Inventory item reads "Cost of goods sold account", but only
// while its label is still the host's: a label an admin wrote in Settings → Forms stays.
function withCogsLabel(
    definition: FormDefinition,
    host: Pick<FormHostDef, 'builtin'>
): FormDefinition {
    const hostLabel = host.builtin.find(b => b.key === 'expense_account')?.label
    return {
        ...definition,
        fields: definition.fields.map(field =>
            field.kind === 'builtin' && field.key === 'expense_account' && field.label === hostLabel
                ? { ...field, label: COGS_ACCOUNT_LABEL }
                : field
        ),
    }
}

// The component that draws the expense account of an Inventory item: a select of the Cost
// of goods sold accounts alone (forms/inventory-fields.tsx).
export const COGS_ACCOUNT_COMPONENT = 'CogsAccountField'

/**
 * The host the product form draws for a type. A host component has no form context, so
 * it cannot read the item's type: for an Inventory item the host names the cost of goods
 * sold select in place of the expense account select. Every other type gets `host` itself.
 */
export function productHostFor<H extends Pick<FormHostDef, 'builtin'>>(
    host: H,
    type: ProductType
): H {
    if (type !== 'inventory') return host
    return {
        ...host,
        builtin: host.builtin.map(field =>
            field.key === 'expense_account' && field.kind === 'custom'
                ? { ...field, component: COGS_ACCOUNT_COMPONENT }
                : field
        ),
    }
}

export type ProductFormBins = {
    // False while the book has no bin location, or its read has not answered.
    hasBins: boolean
}

/**
 * The definition the product form draws for a type. A new product and an edited one show
 * the same fields (`_mode` is kept for the callers that name it). The engine validates a
 * save against the stored definition, so this changes what the form shows only: the
 * Income account required mark is display only, and the server's "Choose an income
 * account." is the check. Default bin hides while the book has no bin location.
 */
export function productDefinitionFor(
    definition: FormDefinition,
    type: ProductType,
    host: Pick<FormHostDef, 'builtin'>,
    _mode: ProductFormMode,
    bins: ProductFormBins = { hasBins: true }
): FormDefinition {
    const hidden = bins.hasBins
        ? PRODUCT_HIDDEN_BUILTINS[type]
        : [...PRODUCT_HIDDEN_BUILTINS[type], ...NO_BINS_HIDDEN_BUILTINS]
    const shown = requireBuiltins(
        hideBuiltins(definition, hidden, host),
        PRODUCT_REQUIRED_BUILTINS[type]
    )
    return type === 'inventory' ? withCogsLabel(shown, host) : shown
}
