import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import { sortContacts } from '../lib/party-contacts'
import type { PartyRef } from '../lib/party-page-tabs'

/**
 * The people at one customer or vendor (spec §3.6), primary first, then by name: one
 * live query on books_party_contacts, on the party's own column. A failed read shows its
 * error until `retry` restarts the query.
 */
export function usePartyContacts({ party, id }: PartyRef) {
    const [contactsCollection] = useStore('books_party_contacts')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ c: contactsCollection })
                .where(({ c }) => eq(party === 'customer' ? c.customer : c.vendor, id)),
        queryKey: [`books.${party}-page.contacts`, id],
    })
    const { data } = query
    const contacts = useMemo(() => sortContacts(data ?? []), [data])
    const isError = query.isError
    const isLoading = !query.isReady && !isError
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [contactsCollection],
            onError: err => log.warn(`books.${party}-page`, 'retry failed', { err }),
        })
    }
    return { contacts, isLoading, isError, retry }
}
