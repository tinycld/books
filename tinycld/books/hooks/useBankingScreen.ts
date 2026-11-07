import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback } from 'react'
import { selectedConnectionId } from '../lib/bank-connections'
import { type ReviewTab, reviewTabFromParam } from '../lib/bank-review'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { useBankConnections } from './useBankConnections'
import { useBankFiles } from './useBankFiles'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type BankingState = 'loading' | 'error' | 'intro' | 'ready'

function bankingState(input: {
    isError: boolean
    isReady: boolean
    rowCount: number
}): BankingState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    return input.rowCount === 0 ? 'intro' : 'ready'
}

export function useBankingScreen() {
    const params = useLocalSearchParams<{ account?: string; tab?: string | string[] }>()
    const account = params.account
    const tab = reviewTabFromParam(params.tab)
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const connections = useBankConnections()
    const selectedId = selectedConnectionId(connections.rows, account)
    const files = useBankFiles(selectedId)
    const orgHref = useOrgHref()
    const isWide = useBreakpoint() !== 'mobile'
    const isPanelMenuOpen = useBankingUIStore(s => s.isPanelMenuOpen)
    const setPanelMenuOpen = useBankingUIStore(s => s.setPanelMenuOpen)
    const openDialog = useBankingUIStore(s => s.openDialog)
    const closeAll = useBankingUIStore(s => s.closeAll)

    useFocusEffect(useCallback(() => () => closeAll(), [closeAll]))

    // The page waits for access, settings and the connections only; the files of the
    // selected card load inside the panel, so a card press never blanks the page.
    const state = bankingState({
        isError: access.isError || settings.hasLoadError || connections.isError || files.isError,
        isReady: access.isReady && settings.isReady && connections.isReady,
        rowCount: connections.rows.length,
    })
    const selected = connections.rows.find(row => row.id === selectedId)

    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    // Every failed page-level read; a tab body merges it into its own Retry, so one press
    // recovers every failed query of the page.
    const pageRecovery = mergeRecoveries([
        connections.recovery,
        files.recovery,
        settings.recovery,
        accessRecovery,
    ])
    const onRetry = () => {
        void recoverLiveQueries({
            ...pageRecovery,
            onError: err => log.error('books.banking', err),
        })
    }
    const onTab = (next: ReviewTab) => router.setParams({ tab: next })

    const onViewRegister = () => {
        if (!selected) return
        router.push(orgHref(`books/accounts/${selected.account}`))
    }
    const onEditDetails = () => {
        if (selectedId) openDialog({ kind: 'edit', connectionId: selectedId })
    }
    const onDisconnect = () => {
        if (selectedId) openDialog({ kind: 'disconnect', connectionId: selectedId })
    }

    return {
        state,
        canWrite: access.canWrite,
        isWide,
        currency: settings.settings?.currency || 'USD',
        rows: connections.rows,
        selected,
        files: files.files,
        isPanelLoading: selectedId !== '' && !files.isReady,
        tab,
        onTab,
        onGoToFiles: () => onTab('files'),
        // Only the account changes: the tab stays as it was.
        onSelect: (id: string) => router.setParams({ account: id }),
        onRetry,
        pageRecovery,
        onConnect: () => openDialog({ kind: 'connect' }),
        onEditDetails,
        onDisconnect,
        onViewRegister,
        isPanelMenuOpen,
        setPanelMenuOpen,
    }
}

export type BankingScreenModel = ReturnType<typeof useBankingScreen>
