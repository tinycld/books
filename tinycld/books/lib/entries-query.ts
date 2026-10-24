import { eq, gte, ilike, lte, or, type Ref } from '@tanstack/db'
import type { BooksJournalEntries } from '../types'
import type { RangePreset, RegisterRange } from './register-range'

export type EntriesStatusFilter = 'all' | 'draft' | 'posted' | 'void'
export type EntriesRange = RangePreset | 'all-dates'

export const DEFAULT_ENTRIES_RANGE: EntriesRange = 'this-fiscal-year'

interface EntriesFilterState {
    status: EntriesStatusFilter
    search: string
    range: EntriesRange
}

type EntryRefs = { entry: Ref<BooksJournalEntries> }

export const searchTerm = (text: string) => text.trim()

export function entriesFilterActive(state: EntriesFilterState): boolean {
    return (
        state.status !== 'all' ||
        searchTerm(state.search) !== '' ||
        state.range !== DEFAULT_ENTRIES_RANGE
    )
}

// One callback per `.where`; a clause is added only when its filter narrows the list.
export function entriesWhere(
    filters: { status: EntriesStatusFilter; search: string },
    range: RegisterRange | null
) {
    const clauses: ((refs: EntryRefs) => ReturnType<typeof eq>)[] = []
    const { status } = filters
    if (status !== 'all') clauses.push(({ entry }) => eq(entry.status, status))
    if (range) {
        clauses.push(({ entry }) => gte(entry.date, range.start))
        clauses.push(({ entry }) => lte(entry.date, range.end))
    }
    const term = searchTerm(filters.search)
    if (term !== '') {
        const pattern = `%${term}%`
        clauses.push(({ entry }) => or(ilike(entry.number, pattern), ilike(entry.memo, pattern)))
    }
    return clauses
}

// pbtsdb pushes only `like` to PocketBase and cannot push `ilike`, so the
// search runs client-side. It matches case-insensitively like the `ilike`
// clause, but treats `%` and `_` literally, which `ilike` treats as wildcards.
// The caller must not push a limit to the server while searching.
export function entryMatchesSearch(
    entry: Pick<BooksJournalEntries, 'number' | 'memo'>,
    search: string
): boolean {
    const term = searchTerm(search).toLowerCase()
    if (term === '') return true
    return [entry.number, entry.memo].some(text => text.toLowerCase().includes(term))
}
