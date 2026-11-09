import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { PICKER_LIMIT } from '../lib/customer-tree'
import { linePartyOptions } from '../lib/line-party-options'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The Name picker's options: active customers and active vendors, each by display name,
 * searched on the client (`linePartyOptions`). The queries run only while the picker is
 * open. The server limit applies only while not searching: a limit pushed during a
 * search would cut matches before the filter sees them (the CustomerPicker pattern).
 */
export function useLinePartyOptions(term: string, isOpen: boolean) {
    const [customersCollection, vendorsCollection] = useStore('books_customers', 'books_vendors')
    const isSearching = term.trim() !== ''
    const customersQuery = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ c: customersCollection })
                .where(({ c }) => eq(c.inactive, false))
                .orderBy(({ c }) => c.display_name)
                .select(({ c }) => ({ id: c.id, display_name: c.display_name }))
            return isSearching ? base : base.limit(PICKER_LIMIT)
        },
        queryKey: ['books.line-party.customers', isOpen, isSearching],
    })
    const vendorsQuery = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ v: vendorsCollection })
                .where(({ v }) => eq(v.inactive, false))
                .orderBy(({ v }) => v.display_name)
                .select(({ v }) => ({ id: v.id, display_name: v.display_name }))
            return isSearching ? base : base.limit(PICKER_LIMIT)
        },
        queryKey: ['books.line-party.vendors', isOpen, isSearching],
    })

    const loadFailed = customersQuery.isError || vendorsQuery.isError
    const isLoading = isOpen && !loadFailed && (customersQuery.isLoading || vendorsQuery.isLoading)
    const options = linePartyOptions({
        customers: customersQuery.data ?? [],
        vendors: vendorsQuery.data ?? [],
        term,
    })

    // Each part is non-empty only when its own query failed, so a retry restarts only the
    // failed read.
    const customersRecovery: LiveRecovery = customersQuery.isError
        ? { queries: [customersQuery.collection], sources: [customersCollection] }
        : NO_RECOVERY
    const vendorsRecovery: LiveRecovery = vendorsQuery.isError
        ? { queries: [vendorsQuery.collection], sources: [vendorsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([customersRecovery, vendorsRecovery]),
            onError: err => log.error('books.line-party', err),
        })
    }

    return { options, isLoading, loadFailed, retry }
}
