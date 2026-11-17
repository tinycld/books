import { create } from '@tinycld/core/lib/store'
import {
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    type DocumentListFilters,
    type ListLayout,
    type ListRange,
    type ListSort,
} from '../lib/document-list'

type TabState = { filters: DocumentListFilters; sort: ListSort }

// A selection or a row focus is kept with the scope it was set in (`selectionScope`): a
// change of tab, layout or filter makes a new scope, so a reader of that scope gets none
// and no effect has to clear it. A change of sort keeps the scope.
type Scoped<T> = { scope: string } & T

interface DocumentListState {
    // Each tab's search, chip, date range, customer and sort, kept while the app is open.
    tabs: Record<string, TabState>
    tabState: (key: string) => TabState
    setSearch: (key: string, text: string) => void
    setChip: (key: string, chipId: string) => void
    setRange: (key: string, range: ListRange) => void
    setCustomer: (key: string, customerId: string) => void
    setSort: (key: string, sort: ListSort) => void
    clearFilters: (key: string) => void
    selection: Scoped<{ ids: readonly string[] }>
    setSelection: (scope: string, ids: readonly string[]) => void
    focus: Scoped<{ id: string }>
    setFocus: (scope: string, id: string) => void
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
        setCustomer: (key, customer) => setFilters(key, { customer }),
        setSort: (key, sort) =>
            set(state => ({ tabs: { ...state.tabs, [key]: { ...tabOf(key), sort } } })),
        clearFilters: key => setFilters(key, DEFAULT_LIST_FILTERS),
        selection: { scope: '', ids: [] },
        setSelection: (scope, ids) => set({ selection: { scope, ids } }),
        focus: { scope: '', id: '' },
        setFocus: (scope, id) => set({ focus: { scope, id } }),
        banner: null,
        setBanner: banner => set({ banner }),
        menu: '',
        setMenu: menu => set({ menu }),
    }
})

// The scope of a selection: the tab, the layout and every filter, not the sort.
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
        filters.customer,
    ])
}

const NO_IDS: readonly string[] = []

export function selectedIn(
    selection: DocumentListState['selection'],
    scope: string
): readonly string[] {
    return selection.scope === scope ? selection.ids : NO_IDS
}
