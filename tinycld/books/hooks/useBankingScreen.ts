import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef } from 'react'
import { connectionLabel, selectedConnectionId } from '../lib/bank-connections'
import { type ReviewTab, reviewTabFromParam } from '../lib/bank-review'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { reconcileButtonVisible } from '../lib/reconcile'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { useBankAdded } from './useBankAdded'
import { useBankCategorize } from './useBankCategorize'
import { useBankConnections } from './useBankConnections'
import { useBankFiles } from './useBankFiles'
import { useBankMatch } from './useBankMatch'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useMatchSuggestions } from './useMatchSuggestions'
import { useReviewBatch } from './useReviewBatch'
import { useReviewDrawer } from './useReviewDrawer'

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
    const resetReviewFilters = useBankingUIStore(s => s.resetReviewFilters)

    useFocusEffect(
        useCallback(
            () => () => {
                closeAll()
                resetReviewFilters()
            },
            [closeAll, resetReviewFilters]
        )
    )

    const selected = connections.rows.find(row => row.id === selectedId)

    // The page waits for access, settings and the connections only; the files of the
    // selected card load inside the panel, so a card press never blanks the page.
    const state = bankingState({
        isError: access.isError || settings.hasLoadError || connections.isError || files.isError,
        isReady: access.isReady && settings.isReady && connections.isReady,
        rowCount: connections.rows.length,
    })

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
    const resetReviewSelection = useBankingUIStore(s => s.resetReviewSelection)
    // One batch for the page: the transaction tabs show its result line and the drawer
    // beside the page runs it. The line lasts until the next action or a tab or account
    // change.
    const batch = useReviewBatch()
    const accountLabel = selected
        ? connectionLabel(selected.accountNumber, selected.accountName)
        : ''
    // The For review tab's shown row ids, in list order: its body sets them while it shows
    // (ReviewTabBody), and the drawer reads them at the press of Exclude, Match, Categorize
    // or Record transfer for the row it shows next.
    const shownRowIds = useRef<readonly string[]>([])
    const drawer = useReviewDrawer({
        accountLabel,
        canWrite: access.canWrite,
        batch,
        shownRowIds,
    })
    const currency = settings.settings?.currency || 'USD'
    // The row marks of For review, read here so the drawer's Match Retry also recovers
    // them: both read the view books_bank_match_suggestions.
    const suggestions = useMatchSuggestions(tab === 'review' && selectedId ? selectedId : null)
    // The drawer's Match section, over the same batch, so a match and an Exclude never run
    // at once.
    const match = useBankMatch({
        drawer,
        canWrite: access.canWrite,
        batch,
        currency,
        suggestionsRecovery: suggestions.recovery,
        accountId: selected?.account ?? '',
        accountLabel,
        shownRowIds,
    })
    // The drawer's way switch and its Categorize and Transfer ways.
    const categorize = useBankCategorize({
        drawer,
        match,
        connectionAccountId: selected?.account ?? '',
        currency,
        canWrite: access.canWrite,
        batch,
        shownRowIds,
    })
    // The drawer's Added to Books section of a Reviewed transaction that was categorized or
    // transferred, with its Undo, over the same batch.
    const added = useBankAdded({
        drawer,
        canWrite: access.canWrite,
        batch,
        connectionAccountId: selected?.account ?? '',
    })
    const setAddedNote = useBankingUIStore(s => s.setAddedNote)
    const setFailedNote = useBankingUIStore(s => s.setFailedNote)
    const leaveRows = () => {
        resetReviewSelection()
        batch.clearResult()
        setAddedNote(null)
        setFailedNote(null)
    }
    const onTab = (next: ReviewTab) => {
        leaveRows()
        router.setParams({ tab: next })
    }

    const onViewRegister = () => {
        if (!selected) return
        router.push(orgHref(`books/accounts/${selected.account}`))
    }
    // The More menu's Reconcile follows the register's rule (reconcileButtonVisible), from the
    // selected connection's own row (bankConnectionsQuery).
    const isReconcileVisible = reconcileButtonVisible({
        canWrite: access.canWrite,
        accountType: selected?.accountType,
        inactive: selected?.accountInactive ?? false,
        hasInProgress: selected?.inProgress !== undefined,
    })
    const onReconcile = () => {
        if (!selected) return
        router.push(orgHref(`books/reconcile?account=${encodeURIComponent(selected.account)}`))
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
        currency,
        rows: connections.rows,
        selected,
        files: files.files,
        isPanelLoading: selectedId !== '' && !files.isReady,
        tab,
        onTab,
        onGoToFiles: () => onTab('files'),
        // Only the account changes: the tab stays as it was.
        onSelect: (id: string) => {
            leaveRows()
            router.setParams({ account: id })
        },
        batch,
        drawer,
        match,
        categorize,
        added,
        shownRowIds,
        suggestions,
        onRetry,
        pageRecovery,
        onConnect: () => openDialog({ kind: 'connect' }),
        onEditDetails,
        onDisconnect,
        onViewRegister,
        onReconcile: isReconcileVisible ? onReconcile : undefined,
        isPanelMenuOpen,
        setPanelMenuOpen,
    }
}

export type BankingScreenModel = ReturnType<typeof useBankingScreen>
