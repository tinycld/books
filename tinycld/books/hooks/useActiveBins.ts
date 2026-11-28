import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

/**
 * The active bin locations by name (inventory-adjust spec §3.3: a picker offers active bins
 * only). One query key, so every Bin picker of a form and the form's own pick rule (an
 * item's default bin is taken only while it is active) read one set of rows. `retry`
 * recovers a failed read.
 */
export function useActiveBins() {
    const [binsCollection] = useStore('books_bins')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ bin: binsCollection })
                .where(({ bin }) => eq(bin.inactive, false))
                .orderBy(({ bin }) => bin.name)
                .select(({ bin }) => ({ id: bin.id, name: bin.name })),
        queryKey: ['books.bins.active'],
    })
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [binsCollection],
            onError: err => log.error('books.bins.active', err),
        })
    }
    return {
        bins: query.data ?? [],
        isLoading: !query.isReady && !query.isError,
        isError: query.isError,
        retry,
    }
}
