import type { PartyListCopy } from './party-list'

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
