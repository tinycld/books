import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { NO_BIN } from '../lib/inventory-adjust-fixture'
import { ID_ORDER } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useHasBinsQuery } from './useHasBins'

// Recent moves: the newest 20, and 20 more for each Show more.
export const TRANSFER_PAGE_SIZE = 20

const NEWEST_FIRST = { direction: 'desc', stringSort: 'lexical' } as const

type BinSide = { name: string; inactive: boolean } | undefined

// No bin last; the bins by name.
function byBinThenName(a: { bin: string; binRow: BinSide }, b: { bin: string; binRow: BinSide }) {
    if (a.bin === NO_BIN) return 1
    if (b.bin === NO_BIN) return -1
    return (a.binRow?.name ?? '').localeCompare(b.binRow?.name ?? '')
}

export type ItemBinsStatus = 'loading' | 'error' | 'no-bins' | 'ready'

/**
 * The item's quantity in each bin (`books_bin_stock` where `product` = id), with each bin
 * by `materialize()`: the rows whose quantity is not 0, No bin last. A row whose bin did
 * not load is dropped rather than called No bin. The Bins tab and Move stock read it; one
 * query key, so both read one set of rows.
 */
export function useItemBinStock(productId: string) {
    const [stockCollection, binsCollection] = useStore('books_bin_stock', 'books_bins')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ stock: stockCollection })
                .where(({ stock }) => eq(stock.product, productId))
                .select(({ stock }) => ({
                    id: stock.id,
                    bin: stock.bin,
                    quantity: stock.quantity,
                    binRow: materialize(
                        q
                            .from({ b: binsCollection })
                            .where(({ b }) => eq(b.id, stock.bin))
                            .select(({ b }) => ({ name: b.name, inactive: b.inactive }))
                            .findOne()
                    ),
                })),
        queryKey: ['books.item.bin-stock', productId],
    })
    const rows = (query.data ?? [])
        .filter(row => row.quantity !== 0 && (row.bin === NO_BIN || row.binRow !== undefined))
        .sort(byBinThenName)
    const recovery: LiveRecovery = {
        queries: [query.collection],
        sources: [stockCollection, binsCollection],
    }
    return { rows, isReady: query.isReady, isError: query.isError, recovery }
}

export type ItemBinStock = ReturnType<typeof useItemBinStock>

export type ItemBinStockRow = ItemBinStock['rows'][number]

/**
 * The item page's Bins tab (inventory-adjust spec §3.8): the item's `books_bin_stock` rows
 * with each bin by `materialize()`, the ones whose quantity is not 0, No bin last; and its
 * moves between bins, newest first, 20 at a time (`showMore`), each with its two bins and
 * its user by `materialize()`. A bin row that is missing (a read that failed) drops the
 * row rather than call it No bin. `status` is `no-bins` while the book has no bin location;
 * `retry` recovers every failed read at once.
 */
export function useItemBins(productId: string) {
    const [transfersCollection, binsCollection, usersCollection] = useStore(
        'books_bin_transfers',
        'books_bins',
        'users'
    )
    const bins = useHasBinsQuery()
    const stock = useItemBinStock(productId)
    const transfersQuery = useLiveInfiniteQuery(
        q =>
            q
                .from({ move: transfersCollection })
                .where(({ move }) => eq(move.product, productId))
                .orderBy(({ move }) => move.created, NEWEST_FIRST)
                .orderBy(({ move }) => move.id, ID_ORDER)
                .select(({ move }) => ({
                    id: move.id,
                    created: move.created,
                    quantity: move.quantity,
                    from: materialize(
                        q
                            .from({ b: binsCollection })
                            .where(({ b }) => eq(b.id, move.from_bin))
                            .select(({ b }) => ({ name: b.name, inactive: b.inactive }))
                            .findOne()
                    ),
                    to: materialize(
                        q
                            .from({ b: binsCollection })
                            .where(({ b }) => eq(b.id, move.to_bin))
                            .select(({ b }) => ({ name: b.name, inactive: b.inactive }))
                            .findOne()
                    ),
                    userName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, move.created_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                })),
        {
            queryKey: ['books.item.bin-transfers', productId],
            pageSize: TRANSFER_PAGE_SIZE,
        }
    )

    const isError = bins.isError || stock.isError || transfersQuery.isError
    const isReady = bins.isReady && stock.isReady && transfersQuery.isReady
    const status: ItemBinsStatus = statusOf(isError, isReady, bins.hasBins)

    const showMore = () => {
        if (transfersQuery.hasNextPage && !transfersQuery.isFetchingNextPage) {
            void transfersQuery.fetchNextPage()
        }
    }
    // Core cleans only a source whose load failed, so every source is named.
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                bins.recovery,
                stock.recovery,
                {
                    queries: [transfersQuery.collection],
                    sources: [transfersCollection, binsCollection, usersCollection],
                },
            ]),
            onError: err => log.error('books.item.bins', err),
        })
    }

    return {
        status,
        stockRows: stock.rows,
        transfers: transfersQuery.data,
        hasMoreTransfers: transfersQuery.hasNextPage,
        isLoadingMore: transfersQuery.isFetchingNextPage,
        showMore,
        retry,
    }
}

function statusOf(
    isError: boolean,
    isReady: boolean,
    hasBins: boolean | undefined
): ItemBinsStatus {
    if (isError) return 'error'
    if (!isReady) return 'loading'
    return hasBins === false ? 'no-bins' : 'ready'
}

export type ItemBins = ReturnType<typeof useItemBins>

export type ItemBinTransferRow = ItemBins['transfers'][number]
