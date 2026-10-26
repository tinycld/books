import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// Every customer in one query, with no `where`: customers are a bounded list, and the
// tree, the search and the inactive filter are shaped in lib/customer-tree.ts.
export function useCustomersQuery() {
    const [customersCollection] = useStore('books_customers')
    const query = useLiveQuery(q => q.from({ customer: customersCollection }))
    // Rebuilds only the failed list query. The collection stays out of `sources`: the open
    // customer and the parent picker read it too, and a cleaned source empties them.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [],
            onError: err => log.error('books.customers', err),
        })
    }
    return {
        customers: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        retry,
    }
}

export type CustomerRecord = ReturnType<typeof useCustomersQuery>['customers'][number]
