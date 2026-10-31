import type { Context, InitialQueryBuilder, QueryBuilder } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'
import { retryListQuery } from '../lib/list-query'
import { anyRecordState } from '../lib/list-search'
import { keepLastSettled, listIsBusy, listViewState, type ShownList } from '../lib/list-state'
import type { PartyListViewState } from '../lib/party-list'
import type { ListFilterState } from './useListFilters'

export type RecordListState<Row> = {
    rows: readonly Row[]
    viewState: PartyListViewState
    query: string
    setQuery(text: string): void
    clearSearch(): void
    showInactive: boolean
    setShowInactive(value: boolean): void
    // The rows on screen are not yet the answer to the search and filter as they stand
    // (see listIsBusy); the list says so as aria-busy.
    isBusy: boolean
    // Asks for the next page; the table and the cards call it as they scroll near the end.
    onNearEnd(): void
}

// What a list's paged query gives the list.
export type PagedListSource<Row> = {
    rows: readonly Row[]
    isReady: boolean
    isError: boolean
    anyRecord: boolean | undefined
    loadMore(): void
}

// A list's rows and state from its paged query. While the query for a new search or
// Show inactive loads, the last settled rows and state stay on screen (keepLastSettled),
// so the toolbar and the search field being typed in stay mounted.
export function useRecordList<Row>(
    filters: ListFilterState,
    source: PagedListSource<Row>
): RecordListState<Row> {
    // The state describes the query's result, so it reads the filters the query ran with,
    // not the text still being typed.
    const now: ShownList<Row> = {
        rows: source.rows,
        viewState: listViewState({
            isReady: source.isReady,
            isError: source.isError,
            rowCount: source.rows.length,
            anyRecord: source.anyRecord,
            search: filters.listFilters.search,
            showInactive: filters.listFilters.showInactive,
        }),
        filters: filters.listFilters,
    }
    const [kept, setKept] = useState<ShownList<Row>>()
    const { next, shown } = keepLastSettled(kept, now)
    if (next !== kept) setKept(next)
    return {
        rows: shown.rows,
        viewState: shown.viewState,
        query: filters.query,
        setQuery: filters.setQuery,
        clearSearch: filters.clearSearch,
        showInactive: filters.showInactive,
        setShowInactive: filters.setShowInactive,
        isBusy: listIsBusy({
            typed: filters.query,
            applied: filters.listFilters.search,
            viewState: now.viewState,
        }),
        onNearEnd: source.loadMore,
    }
}

// The parts of a `useLiveInfiniteQuery` result a list reads.
type InfiniteListQuery = {
    data: readonly unknown[]
    isReady: boolean
    isError: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage(): Promise<void>
    collection: Parameters<typeof retryListQuery>[0][number]
}

// What the three server-paged lists share around their own paged query. `oneRow` is a
// one-row query on the list's collection with no `where`; it runs only while the page is
// empty, to tell "no records" from "none to show". `key` names the list's queries and
// its log context.
export function usePagedListSource<Row, OneRow extends Context>(
    list: InfiniteListQuery,
    rows: readonly Row[],
    options: { key: string; oneRow(q: InitialQueryBuilder): QueryBuilder<OneRow> }
): PagedListSource<Row> & { retry(): void } {
    const isEmpty = list.isReady && list.data.length === 0
    const anyQuery = useLiveQuery({
        queryKey: [`${options.key}.any`, isEmpty],
        query: q => (isEmpty ? options.oneRow(q) : undefined),
    })
    return {
        rows,
        isReady: list.isReady,
        isError: list.isError || anyQuery.isError,
        anyRecord: anyRecordState(isEmpty, anyQuery),
        // The table and the cards call this on every scroll event near the end (and before
        // their content is measured); only one page is asked for at a time.
        loadMore: () => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
        },
        // The open record and the pickers read the collection too, so the retry leaves it
        // alone.
        retry: () => retryListQuery([list.collection, anyQuery.collection], options.key),
    }
}
