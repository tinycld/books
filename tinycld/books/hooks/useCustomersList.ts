import { useMemo, useState } from 'react'
import { customerListViewState, customerRows } from '../lib/customer-tree'
import type { useCustomersQuery } from './useCustomersQuery'

// The search text and Show inactive are local to the Customers layout, which stays
// mounted while customers open and close, so they survive that.
export function useCustomersList(source: ReturnType<typeof useCustomersQuery>) {
    const [query, setQuery] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const rows = useMemo(
        () => customerRows(source.customers, { query, showInactive }),
        [source.customers, query, showInactive]
    )
    const viewState = customerListViewState({
        isReady: source.isReady,
        isError: source.isError,
        customers: source.customers,
        rowCount: rows.length,
        query,
        showInactive,
    })
    return {
        rows,
        viewState,
        query,
        setQuery,
        clearSearch: () => setQuery(''),
        showInactive,
        setShowInactive,
    }
}
