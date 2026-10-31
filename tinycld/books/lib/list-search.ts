import { and, type eq, ilike, or } from '@tanstack/db'

// One page of a Books list. The list's query asks for one row more, to know whether
// another page follows.
export const LIST_PAGE_SIZE = 50

// Books lists order by sort_key, then id. The order is lexical (by code unit): TanStack
// DB builds a string cursor for the next page only for a lexical order, and the store
// then sorts as SQLite does on the server. A row the server has not answered yet has no
// sort_key and sorts first until the server's row lands.
export const SORT_KEY_ORDER = { direction: 'asc', stringSort: 'lexical', nulls: 'first' } as const
export const ID_ORDER = { direction: 'asc', stringSort: 'lexical' } as const

export type ListFilters = { search: string; showInactive: boolean }

type TextColumn = Parameters<typeof ilike>[0]
type Clause = ReturnType<typeof eq>

// The typed search, cut where `%`, `_` or `\` stood. PocketBase's `~` and SQLite's LIKE
// read those as wildcards or as an escape, and TanStack DB's local `ilike` reads `%` and
// `_` as wildcards, so a piece holds none of them and both sides match it as plain text.
export function searchPieces(text: string): string[] {
    return text
        .split(/[%_\\]/)
        .map(piece => piece.trim())
        .filter(piece => piece !== '')
}

// Whether the list's query needs a `where` at all.
export function hasListFilter(filters: ListFilters): boolean {
    return !filters.showInactive || searchPieces(filters.search).length > 0
}

// The list's `where`: every piece of the search in one of the text columns, and only
// active rows unless Show inactive is on. pbtsdb sends it to the server as the request
// filter, and TanStack DB applies it to the rows in the store. `and` and `or` never get
// one argument: pbtsdb turns a one-argument `or` into a broken filter. Call it only when
// `hasListFilter` is true.
export function listFilter(
    columns: { isActive: Clause; text: readonly [TextColumn, TextColumn, ...TextColumn[]] },
    filters: ListFilters
) {
    const clauses = searchPieces(filters.search).map(piece => {
        const [first, second, ...rest] = columns.text.map(column => ilike(column, `%${piece}%`))
        return or(first, second, ...rest)
    })
    if (!filters.showInactive) clauses.push(columns.isActive)
    const [first, second, ...rest] = clauses
    return second === undefined ? first : and(first, second, ...rest)
}

// Whether any record exists. It is asked only while the list shows none (the one-row
// query that answers runs only then), and is undefined until that query answers.
export function anyRecordState(
    isNeeded: boolean,
    probe: { isReady: boolean; data: readonly unknown[] | undefined }
): boolean | undefined {
    if (!isNeeded) return true
    if (!probe.isReady) return undefined
    return (probe.data?.length ?? 0) > 0
}
