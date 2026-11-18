import { useEffect } from 'react'
import type { SelectBoxState } from '../components/SelectBox'
import { selectedIn, useDocumentListStore } from '../stores/document-list-store'

// The header box over the loaded rows: empty with none ticked (and for a list with no
// rows), checked with all ticked, mixed otherwise.
function headerStateOf(tickedLoaded: number, loaded: number): SelectBoxState {
    if (tickedLoaded === 0) return 'empty'
    if (tickedLoaded === loaded) return 'checked'
    return 'mixed'
}

/**
 * The ticked rows of a list, kept in the store under `scope` (`selectionScope`: the tab,
 * the layout and the filters, not the sort). A change of scope reads as no selection at
 * once; when the list leaves a scope (its scope changes, or the list unmounts on a tab
 * change) the store drops the ticks kept for it, so going back to the earlier tab, filters
 * or layout shows none. `loadedIds` are the rows the list holds now: tick-all and the
 * header box work over them; with no rows loaded, tick-all does nothing.
 */
export function useListSelection(scope: string, loadedIds: readonly string[]) {
    const ids = useDocumentListStore(s => selectedIn(s.selection, scope))
    const setSelection = useDocumentListStore(s => s.setSelection)
    const leaveScope = useDocumentListStore(s => s.leaveScope)
    // The cleanup runs with the scope being left, after the list has drawn the new one.
    useEffect(() => () => leaveScope(scope), [scope, leaveScope])
    const ticked = new Set(ids)
    const tickedLoaded = loadedIds.filter(id => ticked.has(id)).length
    const headerState = headerStateOf(tickedLoaded, loadedIds.length)
    const isTicked = (id: string) => ticked.has(id)
    const toggle = (id: string) =>
        setSelection(scope, ticked.has(id) ? ids.filter(other => other !== id) : [...ids, id])
    const tickAll = () => {
        if (loadedIds.length === 0) return
        setSelection(scope, [...loadedIds])
    }
    const clear = () => setSelection(scope, [])
    const toggleAll = () => {
        if (headerState === 'checked') clear()
        else tickAll()
    }
    // After a batch: only these stay ticked (the refused and the skipped documents).
    const keep = (kept: readonly string[]) => setSelection(scope, [...kept])
    return { ids, isTicked, toggle, tickAll, clear, toggleAll, headerState, keep }
}
