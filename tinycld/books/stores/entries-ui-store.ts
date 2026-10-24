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
    setStatus: (status: EntriesStatusFilter) => void
    setSearch: (search: string) => void
    setRange: (range: EntriesRange) => void
    clearFilters: () => void
}

const DEFAULTS = { status: 'all', search: '', range: DEFAULT_ENTRIES_RANGE } as const

export const useEntriesUiStore = create<EntriesUiState>()(set => ({
    ...DEFAULTS,
    setStatus: status => set({ status }),
    setSearch: search => set({ search }),
    setRange: range => set({ range }),
    clearFilters: () => set(DEFAULTS),
}))
