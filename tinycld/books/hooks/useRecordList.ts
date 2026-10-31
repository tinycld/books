import { useMemo, useState } from 'react'
import { type ListRecord, type PartyListViewState, partyListViewState } from '../lib/party-list'

export type RecordListState<Row> = {
    rows: Row[]
    viewState: PartyListViewState
    query: string
    setQuery(text: string): void
    clearSearch(): void
    showInactive: boolean
    setShowInactive(value: boolean): void
}

// The search text and Show inactive are local state of the list's layout, which stays
// mounted while records open and close, so they survive that. `rowsOf` must be a stable
// (module-level) function: it is a memo dependency, and a new one each render rebuilds the rows.
export function useRecordList<T extends ListRecord, Row>(
    source: { records: readonly T[]; isReady: boolean; isError: boolean },
    rowsOf: (records: readonly T[], filters: { query: string; showInactive: boolean }) => Row[]
): RecordListState<Row> {
    const [query, setQuery] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const rows = useMemo(
        () => rowsOf(source.records, { query, showInactive }),
        [rowsOf, source.records, query, showInactive]
    )
    const viewState = partyListViewState({
        isReady: source.isReady,
        isError: source.isError,
        records: source.records,
        rowCount: rows.length,
        query,
        showInactive,
    })
    return {
        rows,
        viewState,
        query,
        setQuery,
        clearSearch: () => setQuery(''),
        showInactive,
        setShowInactive,
    }
}
