import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { DocumentPartyRead } from './document-data'
import { documentRead } from './document-data'

/**
 * The `useParty` of a sales kind's data source: the customer `id` names, as its own live
 * query, not useRecord, so a refused read shows as an error with Retry. `logContext` names
 * the kind in the log of a failed Retry.
 */
export function customerPartyRead(logContext: string) {
    return function useCustomerParty(id: string): DocumentPartyRead {
        const [customersCollection] = useStore('books_customers')
        const query = useLiveQuery({
            query: q => {
                if (!id) return undefined
                return q
                    .from({ c: customersCollection })
                    .where(({ c }) => eq(c.id, id))
                    .findOne()
            },
            queryKey: ['books.document.party', 'customer', id],
        })
        const read = documentRead(id, query, id ? query.data : undefined, [customersCollection])
        const retry = () => {
            if (!query.collection) return
            void recoverLiveQueries({
                queries: [query.collection],
                sources: [customersCollection],
                onError: err => log.error(logContext, err),
            })
        }
        return { ...read, isLoading: id !== '' && query.isLoading, retry }
    }
}
