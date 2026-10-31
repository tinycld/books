import type { PartyListCopy } from './party-list'
import { type ProductType, productTypeNoun } from './product-types'
import { recordTitle } from './record-display'

// The open product's title follows the noun of the form's current type.
export function productTitle(
    type: ProductType,
    { mode, canWrite }: { mode: 'new' | 'edit'; canWrite: boolean }
): string {
    return recordTitle(productTypeNoun(type), { mode, canWrite })
}

export function productsEmptyHint(canWrite: boolean): string {
    if (canWrite) return 'Add what you sell and what you buy.'
    return 'Products and services appear here once a bookkeeper adds them.'
}

export function productListCopy(canWrite: boolean): PartyListCopy {
    return {
        title: 'Products and services',
        singular: 'product or service',
        plural: 'products or services',
        searchPlaceholder: 'Search products and services',
        emptyHint: productsEmptyHint(canWrite),
    }
}
