import { searchPieces } from './list-search'
import type { PartyListViewState } from './party-list'

// The state of a server-filtered list. The page holds only matching rows, so an empty
// page needs `anyRecord` (does any record exist?) to tell 'empty' from 'all-inactive'
// and 'no-match'. 'all-inactive' is only the default view hiding every record: a search
// that finds nothing is 'no-match' whatever the inactive filter.
export function listViewState(input: {
    isReady: boolean
    isError: boolean
    rowCount: number
    anyRecord: boolean | undefined
    search: string
    showInactive: boolean
}): PartyListViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.rowCount > 0) return 'ready'
    if (input.anyRecord === undefined) return 'loading'
    if (!input.anyRecord) return 'empty'
    const hidesOnlyInactive = searchPieces(input.search).length === 0 && !input.showInactive
    return hidesOnlyInactive ? 'all-inactive' : 'no-match'
}

export type ShownList<Row> = { rows: readonly Row[]; viewState: PartyListViewState }

function sameRows<Row>(a: readonly Row[], b: readonly Row[]) {
    return a.length === b.length && a.every((row, i) => row === b[i])
}

// A new search or Show inactive starts a new query, which loads before it shows. Until
// it settles the last settled rows and state stay on screen, so the toolbar (and the
// search field the person is typing in) stays mounted. The kept value is replaced only
// when its contents differ, so a caller that stores it converges.
export function keepLastSettled<Row>(
    prev: ShownList<Row> | undefined,
    now: ShownList<Row>
): { next: ShownList<Row> | undefined; shown: ShownList<Row> } {
    if (now.viewState === 'loading') return { next: prev, shown: prev ?? now }
    if (prev && prev.viewState === now.viewState && sameRows(prev.rows, now.rows)) {
        return { next: prev, shown: prev }
    }
    return { next: now, shown: now }
}
