import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { retryListQuery } from '../lib/list-query'

// Every product in one query, with no `where` (design gate G9): the search and the
// inactive filter are shaped in lib/product-list.ts.
export function useProductsQuery() {
    const [productsCollection] = useStore('books_products')
    // An explicit key, so the query's identity is not rebuilt from its IR on every render.
    const query = useLiveQuery({
        queryKey: ['books.products.all'],
        query: q => q.from({ product: productsCollection }),
    })
    return {
        products: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        // The open product's record reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery(query.collection, 'books.products'),
    }
}

export type ProductRecord = ReturnType<typeof useProductsQuery>['products'][number]
