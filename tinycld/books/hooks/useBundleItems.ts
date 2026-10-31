import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { BundleItemRow } from '../lib/bundle-items'

/** The item rows of bundle `bundleId` in row order; none, and never ready, for ''. */
export function useBundleItems(bundleId: string): { rows: BundleItemRow[]; isReady: boolean } {
    const [itemsCollection] = useStore('books_bundle_items')
    const { data, isReady } = useLiveQuery({
        queryKey: ['books.products.bundle-items', bundleId],
        query: query =>
            bundleId
                ? query
                      .from({ item: itemsCollection })
                      .where(({ item }) => eq(item.bundle, bundleId))
                      .orderBy(({ item }) => item.position)
                : null,
    })
    return { rows: bundleId ? (data ?? []) : [], isReady: bundleId !== '' && isReady }
}
