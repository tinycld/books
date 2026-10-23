import { useState } from 'react'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    nextSort,
    parentIds,
    type SortKey,
    type SortState,
    type TreeAccount,
} from '../lib/account-tree'
import type { AccountGroup } from '../lib/account-types'

// Collapse, filter and sort state is local to the screen and resets on reload.
export function useAccountTree<T extends TreeAccount>(accounts: readonly T[]) {
    const [query, setQuery] = useState('')
    const [group, setGroup] = useState<AccountGroup | ''>('')
    const [showInactive, setShowInactive] = useState(false)
    const [sort, setSort] = useState<SortState>(defaultSort)
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

    const tree = buildAccountTree(accounts, sort)
    const rows = flattenAccountTree(tree, { collapsed, query, group, showInactive, sort })
    const allParentIds = parentIds(tree)
    const areAllCollapsed = allParentIds.length > 0 && allParentIds.every(id => collapsed.has(id))

    const toggleCollapsed = (id: string) => {
        const next = new Set(collapsed)
        if (!next.delete(id)) next.add(id)
        setCollapsed(next)
    }

    const toggleAllCollapsed = () => {
        setCollapsed(areAllCollapsed ? new Set() : new Set(allParentIds))
    }

    const clearFilters = () => {
        setQuery('')
        setGroup('')
        setShowInactive(false)
    }

    return {
        rows,
        // Search flattens ancestors into view, so a caret would not match what shows.
        canToggle: query.trim() === '',
        isEmpty: accounts.length === 0,
        hasFilters: query.trim() !== '' || group !== '' || showInactive,
        query,
        setQuery,
        group,
        setGroup,
        showInactive,
        setShowInactive,
        sort,
        onSort: (key: SortKey) => setSort(current => nextSort(current, key)),
        toggleCollapsed,
        areAllCollapsed,
        toggleAllCollapsed,
        clearFilters,
    }
}
