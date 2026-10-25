import { create } from '@tinycld/core/lib/store'
import {
    DEFAULT_ENTRIES_RANGE,
    type EntriesRange,
    type EntriesStatusFilter,
} from '../lib/entries-query'

interface EntriesUiState {
    status: EntriesStatusFilter
    search: string
    range: EntriesRange
    rowLimit: number
    setStatus: (status: EntriesStatusFilter) => void
    setSearch: (search: string) => void
    setRange: (range: EntriesRange) => void
    growRowLimit: (from: number) => void
    clearFilters: () => void
}

const ROW_LIMIT_STEP = 100

const DEFAULTS = {
    status: 'all',
    search: '',
    range: DEFAULT_ENTRIES_RANGE,
    rowLimit: ROW_LIMIT_STEP,
} as const

export const useEntriesUiStore = create<EntriesUiState>()(set => ({
    ...DEFAULTS,
    // A new filter starts from the first page again.
    setStatus: status => set({ status, rowLimit: ROW_LIMIT_STEP }),
    setSearch: search => set({ search, rowLimit: ROW_LIMIT_STEP }),
    setRange: range => set({ range, rowLimit: ROW_LIMIT_STEP }),
    // `from` is the limit the caller saw, so a burst of near-end events grows the limit once.
    growRowLimit: from => set(s => (s.rowLimit === from ? { rowLimit: from + ROW_LIMIT_STEP } : s)),
    clearFilters: () => set(DEFAULTS),
}))
