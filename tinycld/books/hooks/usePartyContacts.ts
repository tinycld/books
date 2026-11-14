import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import { sortContacts } from '../lib/party-contacts'

/**
 * The people at one customer (spec §3.6), primary first, then by name: one live query on
 * books_party_contacts. A failed read shows its error until `retry` restarts the query.
 */
export function usePartyContacts(customerId: string) {
    const [contactsCollection] = useStore('books_party_contacts')
    const query = useLiveQuery({
        query: q => q.from({ c: contactsCollection }).where(({ c }) => eq(c.customer, customerId)),
        queryKey: ['books.customer-page.contacts', customerId],
    })
    const { data } = query
    const contacts = useMemo(() => sortContacts(data ?? []), [data])
    const isError = query.isError
    const isLoading = !query.isReady && !isError
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [contactsCollection],
            onError: err => log.warn('books.customer-page', 'retry failed', { err }),
        })
    }
    return { contacts, isLoading, isError, retry }
}
