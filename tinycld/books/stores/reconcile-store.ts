import { create } from '@tinycld/core/lib/store'
import {
    nextReconcileSort,
    RECONCILE_DEFAULT_FILTERS,
    RECONCILE_DEFAULT_SORT,
    type ReconcileFilters,
    type ReconcileResult,
    type ReconcileShow,
    type ReconcileSide,
    type ReconcileSort,
    type ReconcileSortColumn,
} from '../lib/reconcile'

// The result is kept as its own object so resultFor hands a selector the same reference on
// every read (a new object each time would re-render without end).
type StampedResult = { reconciliationId: string; result: ReconcileResult }

interface ReconcileState {
    // The account whose start dialog is open; null while no dialog is open.
    startAccountId: string | null
    // Set before the start's insert and cleared when it settles: pbtsdb shows the new row at
    // once, and the dialog must stay open (and refuse to close) until the server has answered,
    // so a refusal shows in it. A store updates synchronously, so the very render the
    // optimistic insert triggers sees the flag.
    isStarting: boolean
    // The phone's compact summary bar, opened to the full band.
    isBandOpen: boolean
    // The work screen's side tab, search and Show choice (spec §3 "Toolbar").
    filters: ReconcileFilters
    // The list's column order.
    sort: ReconcileSort
    // The row the keys act on (core rowFocusStyle); null before the first movement key.
    focusedLineId: string | null
    // The reconciliations with a batch (Clear all shown, Clear matched) in flight. An id is
    // added synchronously before the batch starts and removed when it ends, so the render
    // the first optimistic write triggers already disables the rows, the boxes, Clear
    // matched and Finish. Keyed by reconciliation: a batch that settles after the user
    // opened another reconciliation does not disable that one (isBatchRunningFor).
    runningBatchIds: readonly string[]
    // The result line: the last batch result or refusal, until the next action, stamped
    // with the reconciliation that made it; another reconciliation reads none (resultFor).
    result: StampedResult | null
    openStart: (accountId: string) => void
    closeStart: () => void
    setStarting: (isStarting: boolean) => void
    toggleBand: () => void
    setSide: (side: ReconcileSide) => void
    setSearch: (search: string) => void
    setShow: (show: ReconcileShow) => void
    // A press on a sort header: the sorted column reverses, another column sorts ascending.
    toggleSort: (column: ReconcileSortColumn) => void
    setFocusedLine: (lineId: string | null) => void
    startBatch: (reconciliationId: string) => void
    endBatch: (reconciliationId: string) => void
    setResult: (reconciliationId: string, result: ReconcileResult | null) => void
    // "Clear filters": the side, the search and the Show choice.
    resetFilters: () => void
    // The work screen lost focus or shows another reconciliation: the filters, the focused
    // row and the result line start over.
    resetWork: () => void
}

// Not persisted: an open dialog, an open band or the work screen's filters do not outlive
// the session.
export const useReconcileStore = create<ReconcileState>()(set => ({
    startAccountId: null,
    isStarting: false,
    isBandOpen: false,
    filters: RECONCILE_DEFAULT_FILTERS,
    sort: RECONCILE_DEFAULT_SORT,
    focusedLineId: null,
    runningBatchIds: [],
    result: null,
    openStart: accountId => set({ startAccountId: accountId }),
    closeStart: () => set({ startAccountId: null }),
    setStarting: isStarting => set({ isStarting }),
    toggleBand: () => set(state => ({ isBandOpen: !state.isBandOpen })),
    setSide: side => set(state => ({ filters: { ...state.filters, side } })),
    setSearch: search => set(state => ({ filters: { ...state.filters, search } })),
    setShow: show => set(state => ({ filters: { ...state.filters, show } })),
    toggleSort: column => set(state => ({ sort: nextReconcileSort(state.sort, column) })),
    setFocusedLine: lineId => set({ focusedLineId: lineId }),
    startBatch: reconciliationId =>
        set(state => ({ runningBatchIds: [...state.runningBatchIds, reconciliationId] })),
    endBatch: reconciliationId =>
        set(state => ({
            runningBatchIds: state.runningBatchIds.filter(id => id !== reconciliationId),
        })),
    setResult: (reconciliationId, result) =>
        set({ result: result ? { reconciliationId, result } : null }),
    resetFilters: () => set({ filters: RECONCILE_DEFAULT_FILTERS }),
    resetWork: () => set({ filters: RECONCILE_DEFAULT_FILTERS, focusedLineId: null, result: null }),
}))

type BatchSlice = Pick<ReconcileState, 'runningBatchIds'>
type ResultSlice = Pick<ReconcileState, 'result'>

export function isBatchRunningFor(state: BatchSlice, reconciliationId: string): boolean {
    return state.runningBatchIds.includes(reconciliationId)
}

export function resultFor(state: ResultSlice, reconciliationId: string): ReconcileResult | null {
    const stamped = state.result
    if (!stamped || stamped.reconciliationId !== reconciliationId) return null
    return stamped.result
}
