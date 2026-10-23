import { useState } from 'react'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    nextSort,
    type SortKey,
    type SortState,
    type TreeAccount,
    type TreeNode,
} from '../lib/account-tree'
import { type AccountGroup, accountTypeDef } from '../lib/account-types'

// Parents the group and inactive filters leave on screen; an excluded parent hides its subtree.
function visibleParentIds<T extends TreeAccount>(
    nodes: TreeNode<T>[],
    filters: { group: AccountGroup | ''; showInactive: boolean }
): string[] {
    return nodes.flatMap(node => {
        const { account } = node
        if (account.inactive && !filters.showInactive) return []
        if (filters.group !== '' && accountTypeDef(account.type)?.group !== filters.group) return []
        return [
            ...(node.children.length > 0 ? [account.id] : []),
            ...visibleParentIds(node.children, filters),
        ]
    })
}

// Collapse, filter and sort state is local to the screen and resets on reload.
export function useAccountTree<T extends TreeAccount>(accounts: readonly T[]) {
    const [query, setQuery] = useState('')
    const [group, setGroup] = useState<AccountGroup | ''>('')
    const [showInactive, setShowInactive] = useState(false)
    const [sort, setSort] = useState<SortState>(defaultSort)
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

    const tree = buildAccountTree(accounts, sort)
    const rows = flattenAccountTree(tree, { collapsed, query, group, showInactive, sort })
    const allParentIds = visibleParentIds(tree, { group, showInactive })
    const areAllCollapsed = allParentIds.length > 0 && allParentIds.every(id => collapsed.has(id))

    const toggleCollapsed = (id: string) => {
        setCollapsed(current => {
            const next = new Set(current)
            if (!next.delete(id)) next.add(id)
            return next
        })
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
        hasParents: allParentIds.length > 0,
        isEmpty: accounts.length === 0,
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
