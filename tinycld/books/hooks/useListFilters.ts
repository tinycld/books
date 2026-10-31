import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useState } from 'react'
import { type ListFilters, SEARCH_DELAY_MS } from '../lib/list-search'

// The search text and Show inactive of one list. They live in the list's layout, which
// stays mounted while records open and close, so they survive that. The search field
// shows `query` as typed; the list's query reads `listFilters`, whose search waits for a
// pause in typing, so the server gets one request per pause, not one per keystroke.
export function useListFilters() {
    const [query, setQuery] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const search = useDebouncedValue(query, SEARCH_DELAY_MS)
    const listFilters: ListFilters = { search, showInactive }
    return {
        query,
        setQuery,
        clearSearch: () => setQuery(''),
        showInactive,
        setShowInactive,
        listFilters,
    }
}

export type ListFilterState = ReturnType<typeof useListFilters>
