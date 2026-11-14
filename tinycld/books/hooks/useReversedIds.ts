import { inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useState } from 'react'
import { type KeptReversals, keepReversals, type ReversalRow } from '../lib/reversal-rows'

const NONE: readonly ReversalRow[] = []

// The reversals of the given entries that settle them: posted or void, never a draft
// (autoReversalState, lib/entry-display.ts). The query returns the reversal rows, so the
// originals are read from their `reverses`.
// `ids` are the entries with a posted reversal: only that one stops a person's Reverse.
// `isReady` is false until the query for exactly these entries has answered; until then
// a person's Reverse is not offered. `isKnown(id)` is also true for an entry of the last
// answer while a longer list loads, so its overdue mark stays (lib/reversal-rows.ts).
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
    const answered = entryIds.length === 0 || isReady
    const [kept, setKept] = useState<KeptReversals<ReversalRow>>()
    const { next, rows, isKnown } = keepReversals(kept, { isReady: answered, entryIds, rows: data })
    // State set during render, as useEntriesQuery keeps its rows: keepReversals returns
    // the same value for the same content, so this converges.
    if (next !== kept) setKept(next)

    const ids = new Set(rows.filter(row => row.status === 'posted').map(row => row.reverses))
    const byEntry = new Map<string, ReversalRow[]>()
    for (const row of rows) byEntry.set(row.reverses, [...(byEntry.get(row.reverses) ?? []), row])
    return {
        ids,
        reversalsOf: (entryId: string): readonly ReversalRow[] => byEntry.get(entryId) ?? NONE,
        isKnown,
        isReady: answered,
    }
}
