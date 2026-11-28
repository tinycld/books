import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import {
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'
import { usePagedListSource } from './useRecordList'

/**
 * The bin list (inventory-adjust spec §3.7), one page at a time, as the products list: the
 * name search and Show inactive in the `where`, ordered by `sort_key` (the name case- and
 * accent-folded by the server, migration 2100000049), then id. The order is lexical on both
 * sides (SORT_KEY_ORDER and SQLite's BINARY).
 */
export function useBinsQuery(filters: ListFilters) {
    const [binsCollection] = useStore('books_bins')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ bin: binsCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ bin }) =>
                      listFilter({ isActive: eq(bin.inactive, false), text: [bin.name] }, filters)
                  )
                : all
            return shown
                .orderBy(({ bin }) => bin.sort_key, SORT_KEY_ORDER)
                .orderBy(({ bin }) => bin.id, ID_ORDER)
        },
        {
            queryKey: ['books.bins.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    return usePagedListSource(query, query.data, {
        key: 'books.bins',
        oneRow: q =>
            q
                .from({ bin: binsCollection })
                .orderBy(({ bin }) => bin.id, ID_ORDER)
                .limit(1),
    })
}

export type BinListRow = ReturnType<typeof useBinsQuery>['rows'][number]
