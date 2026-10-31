import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import {
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'
import { usePagedListSource } from './useRecordList'

// One page of vendors at a time, filtered and ordered by the server: the search, the
// inactive filter and the order are the query's, so only the pages scrolled into reach
// the store.
export function useVendorsQuery(filters: ListFilters) {
    const [vendorsCollection] = useStore('books_vendors')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ vendor: vendorsCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ vendor }) =>
                      listFilter(
                          {
                              isActive: eq(vendor.inactive, false),
                              text: [
                                  vendor.display_name,
                                  vendor.company,
                                  vendor.email,
                                  vendor.phone,
                              ],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ vendor }) => vendor.sort_key, SORT_KEY_ORDER)
                .orderBy(({ vendor }) => vendor.id, ID_ORDER)
        },
        {
            queryKey: ['books.vendors.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const data = query.data
    const rows = useMemo(() => data.map(vendor => ({ party: vendor, depth: 0 as const })), [data])
    return usePagedListSource(query, rows, {
        key: 'books.vendors',
        oneRow: q =>
            q
                .from({ vendor: vendorsCollection })
                .orderBy(({ vendor }) => vendor.id, ID_ORDER)
                .limit(1),
    })
}

export type VendorRecord = ReturnType<typeof useVendorsQuery>['rows'][number]['party']
