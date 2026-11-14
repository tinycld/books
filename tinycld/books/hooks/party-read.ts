import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { DocumentPartyKey } from '../lib/sales-document-kinds'
import type { DocumentPartyRead } from './document-data'
import { documentRead } from './document-data'

const PARTY_COLLECTIONS = {
    customer: 'books_customers',
    vendor: 'books_vendors',
} as const satisfies Record<DocumentPartyKey, string>

/**
 * The `useParty` of a kind's data source: the party `id` names, from the collection of
 * the kind's party (customers for a sales kind, vendors for a bill), as its own live
 * query, not useRecord, so a refused read shows as an error with Retry. `logContext`
 * names the kind in the log of a failed Retry.
 */
export function partyRead(party: DocumentPartyKey, logContext: string) {
    const collectionName = PARTY_COLLECTIONS[party]
    return function useParty(id: string): DocumentPartyRead {
        const [partiesCollection] = useStore(collectionName)
        const query = useLiveQuery({
            query: q => {
                if (!id) return undefined
                return q
                    .from({ p: partiesCollection })
                    .where(({ p }) => eq(p.id, id))
                    .findOne()
            },
            queryKey: ['books.document.party', party, id],
        })
        const read = documentRead(id, query, id ? query.data : undefined, [partiesCollection])
        const retry = () => {
            if (!query.collection) return
            void recoverLiveQueries({
                queries: [query.collection],
                sources: [partiesCollection],
                onError: err => log.error(logContext, err),
            })
        }
        return { ...read, isLoading: id !== '' && query.isLoading, retry }
    }
}

// The `useParty` of a sales kind (invoice, sales receipt, estimate): its customer.
export const customerPartyRead = (logContext: string) => partyRead('customer', logContext)

// The `useParty` of a purchase kind (bill): its vendor.
export const vendorPartyRead = (logContext: string) => partyRead('vendor', logContext)
