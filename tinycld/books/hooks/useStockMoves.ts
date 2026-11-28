import { and, eq, inArray } from '@tanstack/db'
import { useLiveInfiniteQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { ID_ORDER, LIST_PAGE_SIZE } from '../lib/list-search'
import type { LiveRecovery } from '../lib/live-recovery'
import { type MoveChip, moveKindsOf } from '../lib/stock-move-chips'

/**
 * The stock moves of an Inventory item (inventory-adjust spec §3.6 "Movements"), newest
 * first (date, then order), 50 at a time: one paged query with the item and the chip's
 * kinds in the `where`, and each move's bin location by `materialize()`. `loadMore` asks
 * for the next page near the end of the page's scroll; `retry` recovers a failed read, and
 * `recovery` is that read's part of a merged retry (the bin locations' read failed too).
 */
export function useStockMoves(productId: string, chip: MoveChip) {
    const [movesCollection, binsCollection] = useStore('books_stock_moves', 'books_bins')
    const kinds = moveKindsOf(chip)
    const query = useLiveInfiniteQuery(
        q =>
            q
                .from({ move: movesCollection })
                .where(({ move }) =>
                    kinds === null
                        ? eq(move.product, productId)
                        : and(eq(move.product, productId), inArray(move.kind, [...kinds]))
                )
                .orderBy(({ move }) => move.date, { direction: 'desc', stringSort: 'lexical' })
                .orderBy(({ move }) => move.seq, { direction: 'desc' })
                .orderBy(({ move }) => move.id, ID_ORDER)
                .select(({ move }) => ({
                    id: move.id,
                    date: move.date,
                    kind: move.kind,
                    source: move.source,
                    document: move.document,
                    document_number: move.document_number,
                    quantity: move.quantity,
                    value: move.value,
                    quantity_after: move.quantity_after,
                    currency: move.currency,
                    bin: move.bin,
                    binRow: materialize(
                        q
                            .from({ b: binsCollection })
                            .where(({ b }) => eq(b.id, move.bin))
                            .select(({ b }) => ({ name: b.name, inactive: b.inactive }))
                            .findOne()
                    ),
                })),
        {
            queryKey: ['books.item.stock-moves', productId, chip],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const loadMore = () => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    }
    // Core cleans only a source whose load failed, so the bins are named too.
    const recovery: LiveRecovery = {
        queries: [query.collection],
        sources: [movesCollection, binsCollection],
    }
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.item.stock-moves', err),
        })
    }
    return {
        moves: query.data,
        isReady: query.isReady || query.isError,
        isError: query.isError,
        loadMore,
        retry,
        recovery,
    }
}

export type StockMoves = ReturnType<typeof useStockMoves>

export type StockMoveRow = StockMoves['moves'][number]
