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
import type { HistorySort } from '../lib/reconcile-history'

// The result is kept as its own object so resultFor hands a selector the same reference on
// every read (a new object each time would re-render without end).
type StampedResult = { reconciliationId: string; result: ReconcileResult }

interface ReconcileState {
    // The account whose start dialog is open; null while no dialog is open.
    startAccountId: string | null
    // Set before the statement dialog's write (the start's insert, Edit info's update) and
    // cleared when it settles: pbtsdb shows the new row at once, and the dialog must stay
    // open (and refuse to close) until the server has answered, so a refusal shows in it. A
    // store updates synchronously, so the very render the optimistic write triggers sees the
    // flag.
    isStarting: boolean
    // Edit info's save in flight: the reconciliation and its statement date before the save.
    // Set with `isStarting` and cleared when the update settles. The optimistic row has the
    // new date at once; the work screen reads its lines with this date until the server has
    // answered, so the lines do not load again under the open dialog (heldStatementDate).
    heldStatement: { reconciliationId: string; statementDate: string } | null
    // The work screen's Edit info dialog and Discard confirm are open.
    isEditOpen: boolean
    isDiscardOpen: boolean
    // The reconciliations with a Finish in flight. An id is added before Finish's update and
    // removed when it settles: the optimistic row reads finished at once, and the work screen
    // must stay (its list disabled, Finish reading "Finishing…") until the server has
    // answered, so a refusal shows in the result line. Keyed by reconciliation, so another
    // reconciliation opened meanwhile is not "Finishing…" (isFinishingFor).
    finishingIds: readonly string[]
    // Set before Discard's delete and cleared when it fails or the screen loses focus: the
    // optimistic delete removes the row at once, and the screen must not show "not found"
    // for its own delete before the route has changed.
    isDiscarding: boolean
    // The hint line shows every hint, not only the first.
    areHintsOpen: boolean
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
    // The history's Account filter: an account id, or '' for All accounts (reconciliation
    // report spec §3 "The history"). It resets when the history loses focus.
    historyAccount: string
    // The history's statement date order; a press on its header reverses it.
    historySort: HistorySort
    openStart: (accountId: string) => void
    closeStart: () => void
    setStarting: (isStarting: boolean) => void
    holdStatement: (held: { reconciliationId: string; statementDate: string } | null) => void
    setEditOpen: (isOpen: boolean) => void
    setDiscardOpen: (isOpen: boolean) => void
    startFinish: (reconciliationId: string) => void
    endFinish: (reconciliationId: string) => void
    setDiscarding: (isDiscarding: boolean) => void
    toggleHints: () => void
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
    // row, the result line, the open hints, Edit info, the Discard confirm and the discard
    // flag start over.
    resetWork: () => void
    setHistoryAccount: (accountId: string) => void
    toggleHistorySort: () => void
    // The history lost focus: All accounts, newest first.
    resetHistory: () => void
}

// Not persisted: an open dialog, an open band or the work screen's filters do not outlive
// the session.
export const useReconcileStore = create<ReconcileState>()(set => ({
    startAccountId: null,
    isStarting: false,
    heldStatement: null,
    isEditOpen: false,
    isDiscardOpen: false,
    finishingIds: [],
    isDiscarding: false,
    areHintsOpen: false,
    isBandOpen: false,
    filters: RECONCILE_DEFAULT_FILTERS,
    sort: RECONCILE_DEFAULT_SORT,
    focusedLineId: null,
    runningBatchIds: [],
    result: null,
    historyAccount: '',
    historySort: 'descending',
    openStart: accountId => set({ startAccountId: accountId }),
    closeStart: () => set({ startAccountId: null }),
    setStarting: isStarting => set({ isStarting }),
    holdStatement: held => set({ heldStatement: held }),
    setEditOpen: isOpen => set({ isEditOpen: isOpen }),
    setDiscardOpen: isOpen => set({ isDiscardOpen: isOpen }),
    startFinish: reconciliationId =>
        set(state => ({ finishingIds: [...state.finishingIds, reconciliationId] })),
    endFinish: reconciliationId =>
        set(state => ({
            finishingIds: state.finishingIds.filter(id => id !== reconciliationId),
        })),
    setDiscarding: isDiscarding => set({ isDiscarding }),
    toggleHints: () => set(state => ({ areHintsOpen: !state.areHintsOpen })),
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
    resetWork: () =>
        set({
            filters: RECONCILE_DEFAULT_FILTERS,
            focusedLineId: null,
            result: null,
            areHintsOpen: false,
            isEditOpen: false,
            isDiscardOpen: false,
            isDiscarding: false,
        }),
    setHistoryAccount: accountId => set({ historyAccount: accountId }),
    toggleHistorySort: () =>
        set(state => ({
            historySort: state.historySort === 'descending' ? 'ascending' : 'descending',
        })),
    resetHistory: () => set({ historyAccount: '', historySort: 'descending' }),
}))

type BatchSlice = Pick<ReconcileState, 'runningBatchIds'>
type FinishSlice = Pick<ReconcileState, 'finishingIds'>
type HeldSlice = Pick<ReconcileState, 'heldStatement'>
type ResultSlice = Pick<ReconcileState, 'result'>

export function isBatchRunningFor(state: BatchSlice, reconciliationId: string): boolean {
    return state.runningBatchIds.includes(reconciliationId)
}

export function isFinishingFor(state: FinishSlice, reconciliationId: string): boolean {
    return state.finishingIds.includes(reconciliationId)
}

// The statement date the work screen reads its lines with while Edit info's save of this
// reconciliation is in flight; null otherwise.
export function heldStatementDate(state: HeldSlice, reconciliationId: string): string | null {
    const held = state.heldStatement
    if (!held || held.reconciliationId !== reconciliationId) return null
    return held.statementDate
}

export function resultFor(state: ResultSlice, reconciliationId: string): ReconcileResult | null {
    const stamped = state.result
    if (!stamped || stamped.reconciliationId !== reconciliationId) return null
    return stamped.result
}
