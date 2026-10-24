import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { useState } from 'react'
import { canWriteAccounts } from '../lib/account-access'
import { useAccountsPanelStore } from '../stores/accounts-panel-store'
import { useAccountActions } from './useAccountActions'
import { useAccountSelection } from './useAccountSelection'
import { type AccountRow, useAccountsQuery } from './useAccountsQuery'
import { useAccountTree } from './useAccountTree'
import { useBooksAccess } from './useBooksAccess'

export type AccountMenuHandlers = {
    onEdit(id: string): void
    onViewRegister(id: string): void
    onAddSub(id: string): void
    onToggleInactive(row: AccountRow): void
    onDelete(id: string): void
}

// Children before parents, because the server refuses a parent while an
// active child remains.
function deepestFirst(rows: ReturnType<typeof useAccountTree<AccountRow>>['rows']) {
    return rows
        .map(row => ({ id: row.node.account.id, depth: row.node.depth }))
        .sort((a, b) => b.depth - a.depth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(row => row.id)
}

export function useAccountsScreen() {
    const { data, isReady, isError, retry } = useAccountsQuery()
    const accounts = data ?? []
    const tree = useAccountTree(accounts)
    const access = useBooksAccess()
    const breakpoint = useBreakpoint()
    const orgHref = useOrgHref()
    const isWide = breakpoint !== 'mobile'
    const onNew = useAccountsPanelStore(s => s.openNew)
    const onOpen = useAccountsPanelStore(s => s.openEdit)
    const openSubAccount = useAccountsPanelStore(s => s.openSubAccount)
    const selection = useAccountSelection()
    const actions = useAccountActions()
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
    const deleteTarget = accounts.find(a => a.id === deleteTargetId) ?? null

    const menu: AccountMenuHandlers = {
        onEdit: onOpen,
        onViewRegister: (id: string) => router.push(orgHref(`books/accounts/${id}`)),
        onAddSub: openSubAccount,
        onToggleInactive: row => {
            void actions.setInactive([row.id], !row.inactive)
        },
        onDelete: (id: string) => {
            actions.clearActionError()
            setDeleteTargetId(id)
        },
    }

    // A row the user cannot see (searched out, collapsed, hidden, deleted)
    // must not be acted on, so the batch is the ticked rows that are visible.
    const batchIds = deepestFirst(tree.rows).filter(id => selection.isSelected(id))

    const makeSelectedInactive = async () => {
        if (actions.isWorking || batchIds.length === 0) return
        const { done } = await actions.setInactive(batchIds, true)
        // Rows the batch did not touch (failed, unattempted, hidden) stay ticked.
        selection.drop(done)
    }

    return {
        canWrite: canWriteAccounts(access),
        isReady,
        isError,
        isWide,
        isTablet: breakpoint === 'tablet',
        tree,
        accounts,
        selection,
        selectedCount: batchIds.length,
        menu,
        makeSelectedInactive,
        actions,
        isWorking: actions.isWorking,
        deleteTarget,
        cancelDelete: () => {
            actions.clearActionError()
            setDeleteTargetId(null)
        },
        actionError: actions.actionError,
        clearActionError: actions.clearActionError,
        onOpen,
        onNew,
        onRetry: retry,
    }
}
