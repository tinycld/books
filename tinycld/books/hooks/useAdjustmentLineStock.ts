import { eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo, useState } from 'react'
import { newFromChange, type OnHandOf } from '../lib/adjustment-values'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// A stored change the On hand leaves out: a line of the posted adjustment that a correction
// replaces (its post voids that adjustment, so its change is taken back first).
export type ExcludedChange = { product: string; bin: string; quantity: number }

const NO_EXCLUDED: readonly ExcludedChange[] = []

// The sum of the excluded changes of an item, and of the item in one bin.
function excludedOf(excluded: readonly ExcludedChange[], product: string, bin: string | null) {
    return excluded
        .filter(change => change.product === product && (bin === null || change.bin === bin))
        .reduce((sum, change) => newFromChange(sum, change.quantity), 0)
}

// The distinct item ids of the lines, sorted, so the query key does not change with the
// lines' order or with a second line of the same item.
function idsOf(productIds: readonly string[]): string[] {
    return [...new Set(productIds.filter(id => id !== ''))].sort()
}

/**
 * The stock of the items on an adjustment's lines (inventory-adjust spec §3.3, Do step 3):
 * one live query of the items (`type`, `inactive`, `quantity_on_hand`, `default_bin`,
 * `asset_account`) with each item's `books_bin_stock` rows materialized. `onHandOf(product,
 * bin)` gives the quantity in the bin ('' is No bin) and the item's total; with no bin in
 * the book the quantity is the total. `isKnown(product)` is false while the item's row has
 * not loaded (its On hand shows "…" and New quantity waits); while a new item's query
 * loads, the items of the last finished query stay known. No item, no query: ready. A
 * failed read gives its query and sources to `recovery`. The result is one object while
 * its rows stay the same. `excluded` (a correction's original lines, while that original
 * is posted) is taken out of the quantity in the bin and of the total, so On hand reads as
 * it will be once the post voids the original.
 */
export function useAdjustmentLineStock(
    productIds: readonly string[],
    hasBins: boolean,
    excluded: readonly ExcludedChange[] = NO_EXCLUDED
) {
    const [productsCollection, stockCollection] = useStore('books_products', 'books_bin_stock')
    const ids = idsOf(productIds)
    const key = ids.join(',')
    const query = useLiveQuery({
        query: q => {
            if (ids.length === 0) return undefined
            return q
                .from({ p: productsCollection })
                .where(({ p }) => inArray(p.id, ids))
                .select(({ p }) => ({
                    id: p.id,
                    type: p.type,
                    inactive: p.inactive,
                    quantity_on_hand: p.quantity_on_hand,
                    default_bin: p.default_bin,
                    asset_account: p.asset_account,
                    inBins: materialize(
                        q
                            .from({ s: stockCollection })
                            .where(({ s }) => eq(s.product, p.id))
                            .select(({ s }) => ({ bin: s.bin, quantity: s.quantity }))
                    ),
                }))
        },
        queryKey: ['books.inventory-adjustment.items', key],
    })
    const rows = query.data
    type StockRow = NonNullable<typeof rows>[number]
    const isLoaded = query.isReady
    // The rows of the last query that finished: a pick of a new item makes a new query (its
    // key is the ids), and while it loads the other lines keep their stock from these. Kept
    // in state, updated while rendering (as useRecordList's keepLastSettled).
    const current = useMemo(
        () => new Map<string, StockRow>((rows ?? []).map(row => [row.id, row])),
        [rows]
    )
    const [lastLoaded, setLastLoaded] = useState<ReadonlyMap<string, StockRow>>(current)
    if (isLoaded && lastLoaded !== current) setLastLoaded(current)
    const merged = useMemo(() => new Map([...lastLoaded, ...current]), [lastLoaded, current])
    const products = isLoaded ? current : merged
    const isError = ids.length > 0 && query.isError
    const isReady = ids.length === 0 || isLoaded || isError
    const collection = query.collection
    // One object while the rows and the excluded changes stay the same, so a reader can
    // follow a change of the stock (the caller keeps `excluded` one array while its changes
    // stay the same).
    return useMemo(() => {
        const onHandOf: OnHandOf = (product, bin) => {
            const row = products.get(product)
            const total = newFromChange(
                row?.quantity_on_hand ?? 0,
                -excludedOf(excluded, product, null)
            )
            if (!hasBins) return { quantity: total, total }
            const inBin = (row?.inBins ?? []).find(stock => stock.bin === bin)
            const quantity = newFromChange(
                inBin?.quantity ?? 0,
                -excludedOf(excluded, product, bin)
            )
            return { quantity, total }
        }
        const recovery: LiveRecovery = isError
            ? { queries: [collection], sources: [productsCollection, stockCollection] }
            : NO_RECOVERY
        return {
            onHandOf,
            isKnown: (product: string) => products.has(product),
            productOf: (id: string) => products.get(id),
            isReady,
            isError,
            recovery,
        }
    }, [
        products,
        hasBins,
        isReady,
        isError,
        collection,
        productsCollection,
        stockCollection,
        excluded,
    ])
}

export type AdjustmentLineStock = ReturnType<typeof useAdjustmentLineStock>
