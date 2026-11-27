import { create } from '@tinycld/core/lib/store'
import type { BatchAction } from '../lib/document-batch'
import {
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    type DocumentListFilters,
    type DocumentListRow,
    type ListLayout,
    type ListRange,
    type ListSort,
} from '../lib/document-list'

type TabState = { filters: DocumentListFilters; sort: ListSort }

// A selection or a row focus is kept with the scope it was set in (`selectionScope`): a
// change of tab, layout or filter makes a new scope, so a reader of that scope gets none at
// once. The list that leaves a scope also drops what was kept for it (`leaveScope`), so
// coming back to that scope shows none. A change of sort keeps the scope.
type Scoped<T> = { scope: string } & T

// A row menu's Void, Delete draft, Delete (a purchase order) or Close (a purchase order)
// dialog. `row` is the row as it was when the dialog opened, so its words stay while the
// write changes the row under it; `listKey` is the mounted list that opened it (its tab's
// `tabStateKey` and an id of that list), so another list of the same tab mounted under it
// does not draw it too.
export type RowDialog = {
    listKey: string
    action: 'void' | 'delete_draft' | 'delete' | 'close'
    row: DocumentListRow
    isRunning: boolean
}

export type BatchCounts = { applies: number; skipped: number }

// The open Batch actions dialog of the list that opened it (`listKey`); `running` holds the
// counts it showed when its confirm was pressed, so its words stay while the writes change the
// rows.
export type BatchDialog = {
    listKey: string
    action: BatchAction
    running: BatchCounts | null
}

interface DocumentListState {
    // Each tab's search, chip, date range, party and sort, kept while the app is open, by
    // `tabStateKey(tab)` (All sales and All purchases share the tab key `all`).
    tabs: Record<string, TabState>
    tabState: (key: string) => TabState
    setSearch: (key: string, text: string) => void
    setChip: (key: string, chipId: string) => void
    setRange: (key: string, range: ListRange) => void
    // The customer (Sales) or vendor (Expenses) id; '' for every party.
    setParty: (key: string, partyId: string) => void
    setSort: (key: string, sort: ListSort) => void
    clearFilters: (key: string) => void
    selection: Scoped<{ ids: readonly string[] }>
    setSelection: (scope: string, ids: readonly string[]) => void
    focus: Scoped<{ id: string }>
    setFocus: (scope: string, id: string) => void
    // Drops the selection and the row focus kept for `scope`, if it is theirs.
    leaveScope: (scope: string) => void
    rowDialog: RowDialog | null
    setRowDialog: (dialog: RowDialog | null) => void
    batchDialog: BatchDialog | null
    setBatchDialog: (dialog: BatchDialog | null) => void
    // The list's banner (a refusal or a batch result); null when none shows.
    banner: string | null
    setBanner: (text: string | null) => void
    // The one open menu of the screen: '', 'new', 'batch' or 'row:<id>'.
    menu: string
    setMenu: (id: string) => void
}

const DEFAULT_TAB: TabState = { filters: DEFAULT_LIST_FILTERS, sort: DEFAULT_LIST_SORT }

// Not persisted: the tabs' state resets when the app reloads (spec §3).
export const useDocumentListStore = create<DocumentListState>()((set, get) => {
    const tabOf = (key: string) => get().tabs[key] ?? DEFAULT_TAB
    const setFilters = (key: string, change: Partial<DocumentListFilters>) => {
        const tab = tabOf(key)
        set(state => ({
            tabs: { ...state.tabs, [key]: { ...tab, filters: { ...tab.filters, ...change } } },
        }))
    }
    return {
        tabs: {},
        tabState: tabOf,
        setSearch: (key, search) => setFilters(key, { search }),
        setChip: (key, chip) => setFilters(key, { chip }),
        setRange: (key, range) => setFilters(key, { range }),
        setParty: (key, party) => setFilters(key, { party }),
        setSort: (key, sort) =>
            set(state => ({ tabs: { ...state.tabs, [key]: { ...tabOf(key), sort } } })),
        clearFilters: key => setFilters(key, DEFAULT_LIST_FILTERS),
        selection: { scope: '', ids: [] },
        setSelection: (scope, ids) => set({ selection: { scope, ids } }),
        focus: { scope: '', id: '' },
        setFocus: (scope, id) => set({ focus: { scope, id } }),
        leaveScope: scope => {
            const { selection, focus } = get()
            if (selection.scope === scope) set({ selection: { scope: '', ids: [] } })
            if (focus.scope === scope) set({ focus: { scope: '', id: '' } })
        },
        rowDialog: null,
        setRowDialog: rowDialog => set({ rowDialog }),
        batchDialog: null,
        setBatchDialog: batchDialog => set({ batchDialog }),
        banner: null,
        setBanner: banner => set({ banner }),
        menu: '',
        setMenu: menu => set({ menu }),
    }
})

// The scope of a selection: the tab (its `tabStateKey`), the layout and every filter, not
// the sort.
export function selectionScope(
    tabKey: string,
    layout: ListLayout,
    filters: DocumentListFilters
): string {
    return JSON.stringify([
        tabKey,
        layout,
        filters.chip,
        filters.search,
        filters.range,
        filters.party,
    ])
}

const NO_IDS: readonly string[] = []

export function selectedIn(
    selection: DocumentListState['selection'],
    scope: string
): readonly string[] {
    return selection.scope === scope ? selection.ids : NO_IDS
}
