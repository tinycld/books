import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useFocusEffect } from 'expo-router'
import { materialize } from 'pbtsdb'
import { useCallback } from 'react'
import { accountLabel } from '../lib/account-options'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { type ReconcileTotals, reconcileTotals, sideWords, stampedTotals } from '../lib/reconcile'
import { useReconcileStore } from '../stores/reconcile-store'
import { useBooksAccess } from './useBooksAccess'
import { useReconcileLines } from './useReconcileLines'
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

    // The phone's band opens in place for one visit: it is closed again when the screen
    // loses focus.
    useFocusEffect(
        useCallback(
            () => () => {
                if (useReconcileStore.getState().isBandOpen)
                    useReconcileStore.getState().toggleBand()
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
        currency: reconciliation?.currency || account?.currency || 'USD',
        words: sideWords(accountType),
        totals,
        rows: lines.rows,
        canWrite: access.canWrite,
        isWide,
        isBandOpen,
        onToggleBand: toggleBand,
        onRetry,
        onBack,
    }
}

export type ReconcileScreenModel = ReturnType<typeof useReconcileScreen>
