import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'
import { hideBuiltins, requireBuiltins } from './form-definition'
import type { ProductType } from './product-types'

// The built-ins only an Inventory item has (the server refuses them on another type).
export const INVENTORY_BUILTINS = [
    'quantity_on_hand',
    'asset_account',
    'preferred_vendor',
    'opening_quantity',
    'opening_value',
    'opening_date',
    'reorder_point',
] as const

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

// A new item has no stock yet: Books counts the quantity on hand from the posted
// transactions, the opening stock among them.
const NEW_HIDDEN_BUILTINS: readonly string[] = ['quantity_on_hand']

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

/**
 * The definition the product form draws for a type, on a new product or an edited one.
 * The engine validates a save against the stored definition, so this changes what the
 * form shows only: the Income account required mark is display only, and the server's
 * "Choose an income account." is the check.
 */
export function productDefinitionFor(
    definition: FormDefinition,
    type: ProductType,
    host: Pick<FormHostDef, 'builtin'>,
    mode: ProductFormMode
): FormDefinition {
    const hidden =
        mode === 'new'
            ? [...PRODUCT_HIDDEN_BUILTINS[type], ...NEW_HIDDEN_BUILTINS]
            : PRODUCT_HIDDEN_BUILTINS[type]
    const shown = requireBuiltins(
        hideBuiltins(definition, hidden, host),
        PRODUCT_REQUIRED_BUILTINS[type]
    )
    return type === 'inventory' ? withCogsLabel(shown, host) : shown
}
