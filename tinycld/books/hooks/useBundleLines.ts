import { eq, inArray, queryOnce } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { BundleItemFill } from '../lib/document-fills'

export type { BundleItemFill } from '../lib/document-fills'

/**
 * Reads a bundle's items once, at the pick that expands it on a sales document line: the
 * bundle's `books_bundle_items` in position order, then their products by id. Items whose
 * product is inactive or gone are left out, so a bundle whose items are all inactive
 * gives `[]`. Two one-shot reads, each from its own collection by a known key, so neither
 * loads more than the bundle's own rows; the products are matched to the items in item
 * order. Not a live query: the expanded lines are copies the user edits, and nothing on
 * screen follows the bundle afterwards. A failed read rejects, and the caller shows it
 * under the cell.
 */
export function useBundleLines() {
    const [bundleItemsCollection, productsCollection] = useStore(
        'books_bundle_items',
        'books_products'
    )
    return async (bundleId: string): Promise<BundleItemFill[]> => {
        const items = await queryOnce({
            query: q =>
                q
                    .from({ item: bundleItemsCollection })
                    .where(({ item }) => eq(item.bundle, bundleId))
                    .orderBy(({ item }) => item.position, 'asc')
                    .select(({ item }) => ({ product: item.product, quantity: item.quantity })),
        })
        const ids = [...new Set(items.map(item => item.product))]
        if (ids.length === 0) return []
        const products = await queryOnce({
            query: q =>
                q
                    .from({ p: productsCollection })
                    .where(({ p }) => inArray(p.id, ids))
                    .select(({ p }) => ({
                        id: p.id,
                        inactive: p.inactive,
                        sales_description: p.sales_description,
                        price: p.price,
                        taxable: p.taxable,
                    })),
        })
        const activeById = new Map(
            products.filter(product => !product.inactive).map(product => [product.id, product])
        )
        return items.flatMap(item => {
            const product = activeById.get(item.product)
            if (!product) return []
            const { id, sales_description, price, taxable } = product
            return [{ product: { id, sales_description, price, taxable }, quantity: item.quantity }]
        })
    }
}
