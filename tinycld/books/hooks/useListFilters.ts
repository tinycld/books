import { useState } from 'react'

// The search text and Show inactive of one list. They live in the list's layout, which
// stays mounted while records open and close, so they survive that; the list's query
// reads them, so the server filters by them.
export function useListFilters() {
    const [query, setQuery] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    return {
        query,
        setQuery,
        clearSearch: () => setQuery(''),
        showInactive,
        setShowInactive,
    }
}

export type ListFilterState = ReturnType<typeof useListFilters>
