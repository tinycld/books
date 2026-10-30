import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { retryListQuery } from '../lib/list-query'

// Every vendor in one query, with no `where`: vendors are a bounded list, and the
// search and the inactive filter are shaped in lib/party-list.ts.
export function useVendorsQuery() {
    const [vendorsCollection] = useStore('books_vendors')
    // An explicit key, so the query's identity is not rebuilt from its IR on every render.
    const query = useLiveQuery({
        queryKey: ['books.vendors.all'],
        query: q => q.from({ vendor: vendorsCollection }),
    })
    return {
        vendors: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        // The open vendor's record reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery(query.collection, 'books.vendors'),
    }
}

export type VendorRecord = ReturnType<typeof useVendorsQuery>['vendors'][number]
