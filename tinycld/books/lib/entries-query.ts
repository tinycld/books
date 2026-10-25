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
    // An optimistic insert has no server-assigned number until the server answers, whatever
    // the row type says, and the list stays mounted under a screen that inserts entries.
    return [entry.number, entry.memo].some(text => (text ?? '').toLowerCase().includes(term))
}

export type EntriesViewState = 'loading' | 'error' | 'empty' | 'no-match' | 'ready'

export function entriesViewState(input: {
    isReady: boolean
    isError: boolean
    hasRows: boolean
    isFilterActive: boolean
    keepsRows: boolean
}): EntriesViewState {
    if (input.isError) return 'error'
    // A later page loading over rows already shown must not unmount the list and lose its scroll position.
    if (!input.isReady) return input.keepsRows && input.hasRows ? 'ready' : 'loading'
    if (input.hasRows) return 'ready'
    return input.isFilterActive ? 'no-match' : 'empty'
}

export function entriesFilterKey(input: {
    status: EntriesStatusFilter
    search: string
    rangeStart?: string
    rangeEnd?: string
}): string {
    return JSON.stringify([
        input.status,
        input.search,
        input.rangeStart ?? null,
        input.rangeEnd ?? null,
    ])
}

export interface KeptRows<T> {
    key: string
    rows: T[]
    limit?: number
}

// One shared empty list keeps the kept value stable across renders, so the caller can compare by reference.
const NO_ROWS: never[] = []

function sameRows<T>(a: T[], b: T[]) {
    return a.length === b.length && a.every((row, i) => row === b[i])
}

// Rows of the last ready query stay on screen while a query under the same filter key loads, but
// only when the new query asks for at least as many rows. A kept value is replaced only when its
// contents differ, so a caller comparing by reference converges even if `rows` is a new array each render.
export function keepRows<T>(
    prev: KeptRows<T> | undefined,
    now: { isReady: boolean; key: string; rows: T[] | undefined; limit?: number }
): { next: KeptRows<T> | undefined; rows: T[] | undefined; keepsRows: boolean } {
    if (now.isReady) {
        const rows = now.rows ?? NO_ROWS
        const same =
            prev && prev.key === now.key && prev.limit === now.limit && sameRows(prev.rows, rows)
        return {
            next: same ? prev : { key: now.key, rows, limit: now.limit },
            rows: now.rows,
            keepsRows: false,
        }
    }
    if (!prev) {
        return { next: prev, rows: now.rows, keepsRows: false }
    }
    if (prev.key !== now.key) {
        return { next: undefined, rows: now.rows, keepsRows: false }
    }
    const canKeep = now.limit === undefined || prev.limit === undefined || now.limit >= prev.limit
    if (canKeep) {
        return { next: prev, rows: prev.rows, keepsRows: true }
    }
    return { next: prev, rows: now.rows, keepsRows: false }
}
