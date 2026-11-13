import { inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

type ReversalRow = { reverses: string; status: string }
const NONE: readonly ReversalRow[] = []

// The reversals of the given entries that settle them: posted or void, never a draft
// (autoReversalState, lib/entry-display.ts). The query returns the reversal rows, so the
// originals are read from their `reverses`.
// `ids` are the entries with a posted reversal: only that one stops a person's Reverse.
// `isReady` is false until the query has answered; until then reversal state is unknown.
export function useReversedIds(entryIds: readonly string[]) {
    const [entriesCollection] = useStore('books_journal_entries')
    const { data, isReady } = useLiveQuery({
        query: query => {
            if (entryIds.length === 0) return undefined
            return query
                .from({ entry: entriesCollection })
                .where(({ entry }) => inArray(entry.reverses, [...entryIds]))
                .where(({ entry }) => inArray(entry.status, ['posted', 'void']))
                .select(({ entry }) => ({ reverses: entry.reverses, status: entry.status }))
        },
        queryKey: ['books.entries.reversed', entryIds.join(',')],
    })
    const rows = data ?? []
    const ids = new Set(rows.filter(row => row.status === 'posted').map(row => row.reverses))
    const byEntry = new Map<string, ReversalRow[]>()
    for (const row of rows) byEntry.set(row.reverses, [...(byEntry.get(row.reverses) ?? []), row])
    return {
        ids,
        reversalsOf: (entryId: string): readonly ReversalRow[] => byEntry.get(entryId) ?? NONE,
        isReady: entryIds.length === 0 || isReady,
    }
}
