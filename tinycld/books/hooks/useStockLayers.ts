import { and, eq, gt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { ID_ORDER } from '../lib/list-search'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The open cost layers of an Inventory item (inventory-adjust spec §3.6 "Stock tab"): its
 * `books_stock_layers` rows with a quantity above 0, oldest first (date, then position).
 * `isEnabled` false (a book that costs by average) reads nothing. A failed read gives its
 * query and source to the page's recovery.
 */
export function useStockLayers(productId: string, isEnabled: boolean) {
    const [layersCollection] = useStore('books_stock_layers')
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ layer: layersCollection })
                .where(({ layer }) => and(eq(layer.product, productId), gt(layer.quantity, 0)))
                .orderBy(({ layer }) => layer.date, { direction: 'asc', stringSort: 'lexical' })
                .orderBy(({ layer }) => layer.position)
                .orderBy(({ layer }) => layer.id, ID_ORDER)
                .select(({ layer }) => ({
                    id: layer.id,
                    date: layer.date,
                    quantity: layer.quantity,
                    value: layer.value,
                    currency: layer.currency,
                }))
        },
        queryKey: ['books.item.stock-layers', productId, isEnabled],
    })
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [layersCollection] }
        : NO_RECOVERY
    return {
        layers: query.data ?? [],
        isReady: !isEnabled || query.isReady || isError,
        isError,
        recovery,
    }
}

export type StockLayerRow = ReturnType<typeof useStockLayers>['layers'][number]
