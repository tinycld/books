import { eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// Ids of the given entries that have a posted reversal. The query returns the reversal rows,
// so the originals are read from their `reverses`.
// `isReady` is false until the query has answered; until then reversal state is unknown.
export function useReversedIds(entryIds: readonly string[]) {
    const [entriesCollection] = useStore('books_journal_entries')
    const { data, isReady } = useLiveQuery({
        query: query => {
            if (entryIds.length === 0) return undefined
            return query
                .from({ entry: entriesCollection })
                .where(({ entry }) => inArray(entry.reverses, [...entryIds]))
                .where(({ entry }) => eq(entry.status, 'posted'))
        },
        queryKey: ['books.entries.reversed', entryIds.join(',')],
    })
    const ids = new Set((data ?? []).map(row => row.reverses))
    return { ids, isReady: entryIds.length === 0 || isReady }
}
