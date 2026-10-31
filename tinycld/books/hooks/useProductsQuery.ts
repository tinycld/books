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

// One page of products at a time, filtered and ordered by the server, so only the pages
// scrolled into reach the store.
export function useProductsQuery(filters: ListFilters) {
    const [productsCollection] = useStore('books_products')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ product: productsCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ product }) =>
                      listFilter(
                          {
                              isActive: eq(product.inactive, false),
                              text: [product.name, product.sku, product.sales_description],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ product }) => product.sort_key, SORT_KEY_ORDER)
                .orderBy(({ product }) => product.id, ID_ORDER)
        },
        {
            queryKey: ['books.products.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    return usePagedListSource(query, query.data, {
        key: 'books.products',
        oneRow: q =>
            q
                .from({ product: productsCollection })
                .orderBy(({ product }) => product.id, ID_ORDER)
                .limit(1),
    })
}

export type ProductRecord = ReturnType<typeof useProductsQuery>['rows'][number]
