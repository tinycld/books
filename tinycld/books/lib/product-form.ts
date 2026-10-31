import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'
import { hideBuiltins, requireBuiltins } from './form-definition'
import type { ProductType } from './product-types'

// Core form rules cannot test a custom built-in's value, so the form follows the
// product type by hiding these built-ins in a definition copy (spec Q4).
export const PRODUCT_HIDDEN_BUILTINS: Record<ProductType, readonly string[]> = {
    service: ['items'],
    non_inventory: ['items'],
    bundle: [
        'price',
        'income_account',
        'purchases',
        'purchase_description',
        'cost',
        'expense_account',
    ],
}

export const PRODUCT_REQUIRED_BUILTINS: Record<ProductType, readonly string[]> = {
    service: ['income_account'],
    non_inventory: ['income_account'],
    bundle: [],
}

/**
 * The definition the product form draws for a type. The engine validates a save
 * against the stored definition, so this changes what the form shows only: the
 * Income account required mark is display only, and the server's "Choose an income
 * account." is the check.
 */
export function productDefinitionFor(
    definition: FormDefinition,
    type: ProductType,
    host: Pick<FormHostDef, 'builtin'>
): FormDefinition {
    return requireBuiltins(
        hideBuiltins(definition, PRODUCT_HIDDEN_BUILTINS[type], host),
        PRODUCT_REQUIRED_BUILTINS[type]
    )
}
