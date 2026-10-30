import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { retryListQuery } from '../lib/list-query'

// Every customer in one query, with no `where`: customers are a bounded list, and the
// tree, the search and the inactive filter are shaped in lib/customer-tree.ts.
export function useCustomersQuery() {
    const [customersCollection] = useStore('books_customers')
    // An explicit key, so the query's identity is not rebuilt from its IR on every render.
    const query = useLiveQuery({
        queryKey: ['books.customers.all'],
        query: q => q.from({ customer: customersCollection }),
    })
    return {
        customers: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        // The parent picker reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery(query.collection, 'books.customers'),
    }
}

export type CustomerRecord = ReturnType<typeof useCustomersQuery>['customers'][number]
