import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { ID_ORDER } from '../lib/list-search'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * Whether the book has a bin location (inventory-adjust spec §3.1): one live query of
 * `books_bins` with one row. `hasBins` is undefined while it loads and when its read fails;
 * a failed read gives its query and source to the screen's one merged recovery, so the
 * screen shows its load error with Retry.
 */
export function useHasBinsQuery() {
    const [binsCollection] = useStore('books_bins')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ bin: binsCollection })
                .orderBy(({ bin }) => bin.id, ID_ORDER)
                .limit(1),
        queryKey: ['books.bins.any'],
    })
    const isError = query.isError
    const hasBins = !query.isReady || isError ? undefined : (query.data?.length ?? 0) > 0
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [binsCollection] }
        : NO_RECOVERY
    return { hasBins, isReady: query.isReady || isError, isError, recovery }
}

/** useHasBinsQuery's answer alone, for a caller whose screen merges the recovery. */
export function useHasBins(): boolean | undefined {
    return useHasBinsQuery().hasBins
}
