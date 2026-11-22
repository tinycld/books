import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { router, useFocusEffect } from 'expo-router'
import { materialize } from 'pbtsdb'
import { useCallback, useMemo, useRef } from 'react'
import type { TextInputInstance } from 'react-native'
import type { ListScrollHandle } from '../components/ListTable'
import { accountLabel } from '../lib/account-options'
import { entryHref } from '../lib/entry-route'
import { SEARCH_DELAY_MS } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import {
    hasReconcileFilter,
    type ReconcileTotals,
    reconcileTotals,
    shownRows,
    sideWords,
    stampedTotals,
} from '../lib/reconcile'
import { resultFor, useReconcileStore } from '../stores/reconcile-store'
import { useBooksAccess } from './useBooksAccess'
import { useReconcileClear } from './useReconcileClear'
import { type ReconcileLineRow, useReconcileLines } from './useReconcileLines'
import { useReconcileShortcuts } from './useReconcileShortcuts'
import { usePopToScreenBelow } from './useStackScreens'

const LOG_CONTEXT = 'books.reconcile'
const ACCOUNTS_ROUTE = 'reconcile/index'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type ReconcileScreenState = 'loading' | 'error' | 'not-found' | 'work' | 'finished'

function screenState(input: {
    isError: boolean
    isRecordReady: boolean
    hasRecord: boolean
    isFinished: boolean
    isLinesLoading: boolean
}): ReconcileScreenState {
    if (input.isError) return 'error'
    if (!input.isRecordReady) return 'loading'
    if (!input.hasRecord) return 'not-found'
    if (input.isFinished) return 'finished'
    return input.isLinesLoading ? 'loading' : 'work'
}

// From the cleared lines while in progress, from the stamped sums once finished.
function totalsOf(
    reconciliation: (Parameters<typeof stampedTotals>[0] & { status: string }) | undefined,
    rows: Parameters<typeof reconcileTotals>[0],
    accountType: string
): ReconcileTotals | null {
    if (!reconciliation) return null
    if (reconciliation.status === 'finished') return stampedTotals(reconciliation, accountType)
    return reconcileTotals(rows, reconciliation, accountType)
}

/**
 * The screen of `books/reconcile/<id>` (reconcile spec §3 "The work screen", "States", §4
 * "Reads"): the reconciliation by id (key `books.reconcile.record`, its own live query, so a
 * failed load has an error state) with its account and the user who finished it through
 * `materialize()`, its lines (useReconcileLines) and the band's totals: from the cleared
 * lines while in progress, from the stamped sums once finished. `state` is `loading` until
 * the record and, in progress, its lines have answered, `error` when one of them or the
 * access read failed, `not-found` when the record answered with no row (a bad id, or
 * another user discarded it). Retry recovers every failed read with one call. Back pops to
 * the accounts screen when it is right below, and replaces this screen with it otherwise.
 * The list (§3 "Toolbar", "Clearing", "Keys"): `shown` is `shownRows` of the lines under
 * the store's side, Show choice and sort, with the search applied after SEARCH_DELAY_MS;
 * `clear` is useReconcileClear, and the keys (useReconcileShortcuts) register in the
 * screen's `list` scope, whose owner every ShortcutButton of the screen takes.
 */
export function useReconcileScreen(id: string) {
    const [reconciliationsCollection, accountsCollection, usersCollection, accessCollection] =
        useStore('books_reconciliations', 'books_accounts', 'users', 'books_access')
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const isWide = useBreakpoint() !== 'mobile'
    const popToAccounts = usePopToScreenBelow(ACCOUNTS_ROUTE)
    const isBandOpen = useReconcileStore(s => s.isBandOpen)
    const toggleBand = useReconcileStore(s => s.toggleBand)

    const recordQuery = useLiveQuery({
        query: q =>
            q
                .from({ r: reconciliationsCollection })
                .where(({ r }) => eq(r.id, id))
                .select(({ r }) => ({
                    ...r,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, r.account))
                            .select(({ a }) => ({
                                id: a.id,
                                name: a.name,
                                number: a.number,
                                type: a.type,
                                currency: a.currency,
                            }))
                            .findOne()
                    ),
                    finishedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, r.finished_by))
                            .select(({ u }) => ({ name: u.name }))
                            .findOne()
                    ),
                }))
                .findOne(),
        queryKey: ['books.reconcile.record', id],
    })
    const reconciliation = recordQuery.isError ? undefined : recordQuery.data
    const lines = useReconcileLines(reconciliation)

    // The phone's band opens in place for one visit, and the side, the search, the Show
    // choice, the focused row and the result line hold for one visit too: all start over
    // when the screen loses focus. The route is keyed by the id (screens/reconcile/[id]),
    // so another reconciliation unmounts this screen, which runs the same cleanup.
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useReconcileStore.getState()
                if (store.isBandOpen) store.toggleBand()
                store.resetWork()
            },
            []
        )
    )

    const account = reconciliation?.accountRow
    const accountType = account?.type ?? 'bank'
    const isFinished = reconciliation?.status === 'finished'
    const state = screenState({
        isError: recordQuery.isError || lines.isError || access.isError,
        isRecordReady: recordQuery.isReady && access.isReady,
        hasRecord: reconciliation !== undefined,
        isFinished,
        isLinesLoading: lines.isLoading,
    })
    const totals = totalsOf(reconciliation, lines.rows, accountType)
    const currency = reconciliation?.currency || account?.currency || 'USD'

    // The list: the filters as typed, the search applied after a pause in typing.
    const filters = useReconcileStore(s => s.filters)
    const sort = useReconcileStore(s => s.sort)
    const focusedLineId = useReconcileStore(s => s.focusedLineId)
    // A result of another reconciliation (a batch that settled after this one opened) is
    // not this screen's.
    const result = useReconcileStore(s => resultFor(s, id))
    const appliedSearch = useDebouncedValue(filters.search, SEARCH_DELAY_MS)
    // Keyed by the primitives it reads, not by `filters`: a keystroke in the search changes
    // `filters` but not the applied search, and must not filter and sort every row again.
    const { side, show } = filters
    const shown = useMemo(
        () => shownRows(lines.rows, { side, show, search: appliedSearch }, sort, currency),
        [lines.rows, side, show, appliedSearch, sort, currency]
    )
    const canWrite = access.canWrite
    const clear = useReconcileClear({
        reconciliationId: id,
        rows: lines.rows,
        shown,
        canWrite,
    })
    const searchRef = useRef<TextInputInstance>(null)
    const listScrollRef = useRef<ListScrollHandle>(null)
    const onOpen = (row: ReconcileLineRow) =>
        router.push(
            orgHref(
                entryHref({
                    id: row.entry,
                    doc_type: row.doc_type,
                    origin: row.origin,
                    document: row.document,
                })
            )
        )
    const scopeOwner = useReconcileShortcuts({
        isEnabled: state === 'work',
        canWrite,
        isBatchRunning: clear.isBatchRunning,
        isWriteBlocked: clear.isWriteBlocked,
        shown,
        focusedLineId,
        matchedCount: clear.matchedCount,
        search: filters.search,
        searchRef,
        listScrollRef,
        onToggle: clear.onToggle,
        onToggleAllShown: clear.onToggleAllShown,
        onClearMatched: clear.onClearMatched,
        onOpen,
    })

    const onRetry = () => {
        const recordRecovery: LiveRecovery = recordQuery.isError
            ? {
                  queries: [recordQuery.collection],
                  sources: [reconciliationsCollection, accountsCollection, usersCollection],
              }
            : NO_RECOVERY
        const accessRecovery: LiveRecovery = access.isError
            ? { queries: [access.collection], sources: [accessCollection] }
            : NO_RECOVERY
        void recoverLiveQueries({
            ...mergeRecoveries([recordRecovery, lines.recovery, accessRecovery]),
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }
    const onBack = () => {
        if (popToAccounts()) return
        router.replace(orgHref('books/reconcile'))
    }

    return {
        state,
        reconciliation,
        account,
        accountLabel: account ? accountLabel(account) : '',
        accountType,
        currency,
        words: sideWords(accountType),
        totals,
        rows: lines.rows,
        shown,
        filters,
        hasFilter: hasReconcileFilter(filters),
        sort,
        focusedLineId,
        result,
        clear,
        searchRef,
        listScrollRef,
        scopeOwner,
        onOpen,
        canWrite,
        isWide,
        isBandOpen,
        onToggleBand: toggleBand,
        onRetry,
        onBack,
    }
}

export type ReconcileScreenModel = ReturnType<typeof useReconcileScreen>
