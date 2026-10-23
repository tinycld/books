import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { canWriteAccounts } from '../lib/account-access'
import { useAccountsPanelStore } from '../stores/accounts-panel-store'
import { useAccountsQuery } from './useAccountsQuery'
import { useAccountTree } from './useAccountTree'
import { useBooksAccess } from './useBooksAccess'

export function useAccountsScreen() {
    const { data, isReady, isError, retry } = useAccountsQuery()
    const tree = useAccountTree(data ?? [])
    const access = useBooksAccess()
    const isWide = useBreakpoint() !== 'mobile'
    const onNew = useAccountsPanelStore(s => s.openNew)
    const onOpen = useAccountsPanelStore(s => s.openEdit)
    return {
        canWrite: canWriteAccounts(access),
        isReady,
        isError,
        isWide,
        tree,
        onOpen,
        onNew,
        onRetry: retry,
    }
}
