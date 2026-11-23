import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import type { PickItem } from '@tinycld/core/ui/pick-menu'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { materialize } from 'pbtsdb'
import { type RefObject, useCallback, useId, useMemo, useRef, useState } from 'react'
import { accountLabel } from '../lib/account-options'
import { releaseDomFocus } from '../lib/dom-focus'
import { movedFocus } from '../lib/list-shortcuts'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import {
    canUndoRow,
    HISTORY_KEY_LABELS,
    HISTORY_KEYS,
    HISTORY_TEXTS,
    type HistoryKeyAction,
    historyAccounts,
    historyState,
    latestFinishedIds,
    offeredHistoryKeyActions,
    shownHistory,
} from '../lib/reconcile-history'
import { RECONCILIATION_REPORT_SHIPPED_KEY } from '../lib/shipped-reports'
import { useReconcileStore } from '../stores/reconcile-store'
import { useBooksAccess } from './useBooksAccess'
import { noMenuLayerOpen } from './useReconcileAccounts'
import { shippedReportHref, useShippedReportId } from './useShippedReportHref'

const LOG_CONTEXT = 'books.reconcile'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_SHORTCUTS: Shortcut[] = []

function relayTo(
    ref: RefObject<Record<HistoryKeyAction, () => void>>
): Record<HistoryKeyAction, () => void> {
    return {
        next: () => ref.current.next(),
        previous: () => ref.current.previous(),
        open: () => ref.current.open(),
        report: () => ref.current.report(),
    }
}

/**
 * The History tab of Reconcile, `books/reconcile/history` (reconciliation report spec §3
 * "The history", §4 "Reads"). Two live queries: every finished reconciliation (key
 * `books.reconcile.history`) with its account through `materialize()` (a row whose account
 * is missing is dropped after the query), and the reconciliations in progress (key
 * `books.reconcile.history.open`, `openRows`). The filter's accounts, the latest row of each
 * account, the rows under the filter and their order come from the first query's rows
 * (lib/reconcile-history.ts), so the filter sends no request. One more query reads the
 * picked account's label only when the history has no row of it (an `?account=` with none).
 * The Account filter and the sort are in the reconcile store: `?account=` sets the filter
 * once, at the first focus of this screen, and both reset when the screen loses focus. The
 * keys ↓ / J, ↑ / K, ↵ / O and R are registered in the screen's `list` scope, each while its
 * action is offered and no menu is open. Realtime needs no code: both reads are live.
 * Undo reconciliation (`canUndo`, `onUndo`) opens the undo dialog (ReconcileUndoDialog);
 * while its undo is sent the row stays listed as it was (the store's `undoingId`). A lost
 * focus closes the dialog (closeUndo), unless its undo is sent. While the server takes no
 * writes, `undoHint` is core's reason, which the row menus show under the disabled item.
 */
export function useReconcileHistory() {
    const [reconciliationsCollection, accountsCollection, accessCollection] = useStore(
        'books_reconciliations',
        'books_accounts',
        'books_access'
    )
    const access = useBooksAccess()
    const writes = useServerActionState()
    const orgHref = useOrgHref()
    const owner = useShortcutScope('list')
    const instance = useId()
    const historyAccount = useReconcileStore(s => s.historyAccount)
    const historySort = useReconcileStore(s => s.historySort)
    const setHistoryAccount = useReconcileStore(s => s.setHistoryAccount)
    const toggleHistorySort = useReconcileStore(s => s.toggleHistorySort)

    const historyQuery = useLiveQuery({
        query: q =>
            q
                .from({ r: reconciliationsCollection })
                .where(({ r }) => eq(r.status, 'finished'))
                .orderBy(({ r }) => r.statement_date, 'desc')
                .select(({ r }) => ({
                    ...r,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, r.account))
                            .select(({ a }) => ({
                                id: a.id,
                                name: a.name,
                                full_name: a.full_name,
                                number: a.number,
                                type: a.type,
                                currency: a.currency,
                            }))
                            .findOne()
                    ),
                })),
        queryKey: ['books.reconcile.history'],
    })
    const openQuery = useLiveQuery({
        query: q =>
            q
                .from({ r: reconciliationsCollection })
                .where(({ r }) => eq(r.status, 'in_progress'))
                .select(({ r }) => ({
                    id: r.id,
                    account: r.account,
                    statement_date: r.statement_date,
                })),
        queryKey: ['books.reconcile.history.open'],
    })

    const isHistoryReady = historyQuery.isReady && !historyQuery.isError
    const historyData = historyQuery.data
    // A row whose account did not load (deleted, or not readable) has no label to show.
    const listedRows = useMemo(
        () =>
            isHistoryReady
                ? (historyData ?? []).flatMap(row =>
                      row.accountRow ? [{ ...row, accountRow: row.accountRow }] : []
                  )
                : [],
        [isHistoryReady, historyData]
    )
    // The undo dialog's row as it was listed, taken by `onUndo` from the row the user
    // pressed: while its undo is sent the optimistic row has left the finished query, and
    // the row stays until the server has answered, so the screen does not change under the
    // dialog. It counts only while its dialog is open (closeUndo clears `undoTarget`), and
    // it is dropped during the render after both its dialog and its undo have ended, so the
    // row object does not outlive them.
    const undoTarget = useReconcileStore(s => s.undoTarget)
    const undoingId = useReconcileStore(s => s.undoingId)
    const [pressedRow, setPressedRow] = useState<(typeof listedRows)[number] | null>(null)
    if (pressedRow !== null && pressedRow.id !== undoTarget && pressedRow.id !== undoingId) {
        setPressedRow(null)
    }
    const held = pressedRow !== null && pressedRow.id === undoTarget ? pressedRow : null
    const isHeld =
        undoingId !== null && held?.id === undoingId && !listedRows.some(r => r.id === undoingId)
    const rows = useMemo(
        () => (isHeld && held ? [...listedRows, held] : listedRows),
        [isHeld, held, listedRows]
    )
    const openRows = openQuery.isReady && !openQuery.isError ? (openQuery.data ?? []) : []

    const accounts = useMemo(() => historyAccounts(rows), [rows])
    const latestIds = useMemo(() => latestFinishedIds(rows), [rows])
    const shown = useMemo(
        () => shownHistory(rows, historyAccount, historySort),
        [rows, historyAccount, historySort]
    )

    // The picked account's label when the history has none of its rows: the empty state
    // under the filter names it. When its last row leaves (an undo, here or by realtime) the
    // label it had while its rows were listed is kept, so the body goes straight to the
    // empty state and never back to loading (the ledger's Design note 27).
    // The label is remembered during the render that lists it (a guarded set of this hook's
    // own state, React's "adjust state while rendering"), and counts only while its account is
    // the picked one; a lost focus clears it.
    const pickedListed = accounts.find(account => account.id === historyAccount)
    const [rememberedLabel, setRememberedLabel] = useState<{
        accountId: string
        label: string
    } | null>(null)
    if (
        pickedListed &&
        (rememberedLabel?.accountId !== pickedListed.id ||
            rememberedLabel.label !== pickedListed.label)
    ) {
        setRememberedLabel({ accountId: pickedListed.id, label: pickedListed.label })
    }
    const keptLabel =
        rememberedLabel?.accountId === historyAccount && historyAccount !== ''
            ? rememberedLabel.label
            : ''
    const needsAccountRead =
        historyAccount !== '' && isHistoryReady && !pickedListed && keptLabel === ''
    const accountQuery = useLiveQuery({
        query: q => {
            if (!needsAccountRead) return undefined
            return q
                .from({ a: accountsCollection })
                .where(({ a }) => eq(a.id, historyAccount))
                .select(({ a }) => ({ id: a.id, name: a.name, number: a.number }))
                .findOne()
        },
        queryKey: ['books.reconcile.history.account', historyAccount, needsAccountRead],
    })
    const isAccountError = needsAccountRead && accountQuery.isError
    const readAccount = needsAccountRead && !isAccountError ? accountQuery.data : undefined
    const readLabel = readAccount ? accountLabel(readAccount) : ''
    const pickedLabel = pickedListed?.label ?? (keptLabel || readLabel)
    const isAccountLoading = needsAccountRead && !accountQuery.isReady
    const filterLabel = historyAccount === '' ? HISTORY_TEXTS.allAccounts : pickedLabel

    // The keyboard's row focus: local to this screen, and dropped when its row leaves.
    const [focusedId, setFocusedId] = useState('')

    // books/reconcile/history?account=<id>: set once, at this screen's first focus. The
    // only link that sets it is on a finished summary, so an earlier history screen lost
    // focus (and reset) when that summary was pushed, before this one focuses. A lost focus
    // resets the filter, the sort and the focused row, so a return starts over.
    const params = useLocalSearchParams<{ account?: string }>()
    const paramAccount = typeof params.account === 'string' ? params.account : ''
    const hasReadParam = useRef(false)
    useFocusEffect(
        useCallback(() => {
            if (!hasReadParam.current) {
                hasReadParam.current = true
                if (paramAccount !== '')
                    useReconcileStore.getState().setHistoryAccount(paramAccount)
            }
            return () => {
                const store = useReconcileStore.getState()
                store.resetHistory()
                // An undo dialog opened here (or on a summary above) does not follow the
                // user back; it does nothing while an undo is sent.
                store.closeUndo()
                setFocusedId('')
                setRememberedLabel(null)
            }
        }, [paramAccount])
    )

    const state = historyState({
        isLoading:
            !historyQuery.isReady || !openQuery.isReady || !access.isReady || isAccountLoading,
        isError: historyQuery.isError || openQuery.isError || access.isError || isAccountError,
        all: rows,
        shown,
        accountId: historyAccount,
    })

    const onRetry = () => {
        const historyRecovery: LiveRecovery = historyQuery.isError
            ? {
                  queries: [historyQuery.collection],
                  sources: [reconciliationsCollection, accountsCollection],
              }
            : NO_RECOVERY
        const openRecovery: LiveRecovery = openQuery.isError
            ? { queries: [openQuery.collection], sources: [reconciliationsCollection] }
            : NO_RECOVERY
        const accessRecovery: LiveRecovery = access.isError
            ? { queries: [access.collection], sources: [accessCollection] }
            : NO_RECOVERY
        const accountRecovery: LiveRecovery = isAccountError
            ? { queries: [accountQuery.collection], sources: [accountsCollection] }
            : NO_RECOVERY
        void recoverLiveQueries({
            ...mergeRecoveries([historyRecovery, openRecovery, accessRecovery, accountRecovery]),
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }

    // The Reconciliation Report's id, read once; while it is null no View report is drawn.
    const reportId = useShippedReportId(RECONCILIATION_REPORT_SHIPPED_KEY)
    const hasReport = reportId !== null
    const onOpenRow = (id: string) => router.push(orgHref(`books/reconcile/${id}`))
    const onOpenReport = (id: string) => {
        if (reportId) router.push(shippedReportHref(orgHref, reportId, { statement: id }))
    }
    const onClearFilter = () => setHistoryAccount('')
    const onPickAccount = (accountId: string) => setHistoryAccount(accountId)
    const onSort = toggleHistorySort
    const onGoToAccounts = () => router.replace(orgHref('books/reconcile'))
    // Undo reconciliation (spec §3 "Undo"): a Books admin, on the latest row of an account;
    // the item is disabled while an undo is sent or the server takes no writes.
    const isAdmin = access.isAdmin
    const canUndo = (row: { id: string }) => canUndoRow(row, latestIds, isAdmin)
    const onUndo = (id: string) => {
        // The dialog opens first: a render between the two sets then holds no stale row.
        useReconcileStore.getState().openUndo(id)
        setPressedRow(listedRows.find(row => row.id === id) ?? null)
    }
    const isUndoDisabled = writes.isDisabled || undoingId !== null
    // Why Undo reconciliation is disabled while the server takes no writes (core's reason).
    const undoHint = writes.accessibilityHint

    // The Account filter's items: "All accounts", then each account that has a finished
    // reconciliation, by account number.
    const filterItems: PickItem[] = [
        {
            id: 'all',
            label: HISTORY_TEXTS.allAccounts,
            isSelected: historyAccount === '',
            onSelect: onClearFilter,
        },
        ...accounts.map(account => ({
            id: account.id,
            label: account.label,
            isSelected: account.id === historyAccount,
            onSelect: () => onPickAccount(account.id),
        })),
    ]

    const shownIds = useMemo(() => shown.map(row => row.id), [shown])
    const focusedIndex = shownIds.indexOf(focusedId)
    const run: Record<HistoryKeyAction, () => void> = {
        next: () => {
            releaseDomFocus()
            setFocusedId(movedFocus(shownIds, focusedId, 1))
        },
        previous: () => {
            releaseDomFocus()
            setFocusedId(movedFocus(shownIds, focusedId, -1))
        },
        open: () => {
            if (focusedIndex >= 0) onOpenRow(shownIds[focusedIndex])
        },
        report: () => {
            if (focusedIndex >= 0) onOpenReport(shownIds[focusedIndex])
        },
    }
    const runRef = useRef(run)
    runRef.current = run
    const hasFocusedRow = focusedIndex >= 0
    const hasRows = state === 'rows'
    const shortcuts = useMemo(() => {
        const offered = offeredHistoryKeyActions({ hasRows, hasFocusedRow, hasReport })
        if (offered.length === 0) return NO_SHORTCUTS
        const relay = relayTo(runRef)
        return offered.flatMap(action =>
            HISTORY_KEYS[action].map(key => ({
                id: `books.reconcile.history.${instance}.${action}.${key}`,
                keys: key,
                scope: 'list' as const,
                description: HISTORY_KEY_LABELS[action],
                group: 'Reconcile',
                when: noMenuLayerOpen,
                run: () => relay[action](),
            }))
        )
    }, [hasRows, hasFocusedRow, hasReport, instance])
    useRegisterShortcuts(shortcuts, owner)

    return {
        state,
        rows,
        shown,
        latestIds,
        accounts,
        openRows,
        isAdmin,
        canUndo,
        onUndo,
        isUndoDisabled,
        undoHint,
        historyAccount,
        historySort,
        filterLabel,
        filterItems,
        pickedLabel,
        hasFilter: historyAccount !== '',
        hasReport,
        focusedId: hasFocusedRow ? focusedId : '',
        focusedIndex: hasFocusedRow ? focusedIndex : undefined,
        onRetry,
        onOpenRow,
        onOpenReport,
        onPickAccount,
        onClearFilter,
        onSort,
        onGoToAccounts,
    }
}

export type ReconcileHistoryModel = ReturnType<typeof useReconcileHistory>
export type ReconcileHistoryRowData = ReconcileHistoryModel['rows'][number]
