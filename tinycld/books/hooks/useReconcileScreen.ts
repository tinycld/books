import { and, eq, lte } from '@tanstack/db'
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
import { localDayOf } from '../lib/opening-balances'
import {
    finishedByText,
    hasReconcileFilter,
    type ReconcileTotals,
    reconcileTotals,
    shownRows,
    sideWords,
    stampedTotals,
} from '../lib/reconcile'
import { reconcileHints } from '../lib/reconcile-hints'
import type { ReconcileHeaderKey } from '../lib/reconcile-shortcuts'
import { RECONCILIATION_REPORT_SHIPPED_KEY } from '../lib/shipped-reports'
import {
    heldStatementDate,
    isFinishingFor,
    resultFor,
    useReconcileStore,
} from '../stores/reconcile-store'
import { useBooksAccess } from './useBooksAccess'
import { useReconcileActions } from './useReconcileActions'
import { useReconcileClear } from './useReconcileClear'
import { type ReconcileLineRow, useReconcileLines } from './useReconcileLines'
import { useReconcileHeaderKeys, useReconcileShortcuts } from './useReconcileShortcuts'
import type { ReconcileEditTarget } from './useReconcileStart'
import { useShippedReportHref } from './useShippedReportHref'
import { usePopToScreenBelow } from './useStackScreens'

const LOG_CONTEXT = 'books.reconcile'
const ACCOUNTS_ROUTE = 'reconcile/index'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type ReconcileScreenState = 'loading' | 'error' | 'not-found' | 'work' | 'finished'

function screenState(input: {
    isError: boolean
    isRecordReady: boolean
    hasRecord: boolean
    isDiscarding: boolean
    isFinished: boolean
    isLinesLoading: boolean
}): ReconcileScreenState {
    if (input.isError) return 'error'
    if (!input.isRecordReady) return 'loading'
    // The user's own Discard removed the row; the screen goes back once the server answers.
    if (!input.hasRecord) return input.isDiscarding ? 'loading' : 'not-found'
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
 * failed load has an error state) with its account through `materialize()` (the finisher's
 * name is stamped on the row, `finished_by_name`), its lines (useReconcileLines) and the
 * band's totals: from the cleared lines while in progress, from the stamped sums once finished. `state` is `loading` until
 * the record and, in progress, its lines have answered, `error` when one of them or the
 * access read failed, `not-found` when the record answered with no row (a bad id, or
 * another user discarded it). Retry recovers every failed read with one call. Back pops to
 * the accounts screen when it is right below, and replaces this screen with it otherwise.
 * The list (§3 "Toolbar", "Clearing", "Keys"): `shown` is `shownRows` of the lines under
 * the store's side, Show choice and sort, with the search applied after SEARCH_DELAY_MS;
 * `clear` is useReconcileClear, and the keys (useReconcileShortcuts) register in the
 * screen's `list` scope, whose owner every ShortcutButton of the screen takes.
 * The hint line (§3 "Hints"): `reconcileHints` over the lines, with the For review count of
 * the account's bank connection (key `books.reconcile.review`, whose load error is the
 * screen's too). The header's actions and the hints' actions are useReconcileActions; while
 * Finish is sent (`isFinishing`) the state stays `work` with the lines, and a Discard of
 * the user's own (`isDiscarding`) reads `loading`, not `not-found`. `editTarget` is Edit
 * info's data from this one record query (with the account's latest finished statement
 * date), null while the dialog is closed. While its save is in flight the lines and the For
 * review count read the stored date (the store's `heldStatement`), so the state stays `work`
 * and the dialog stays open until the server has answered. The finished summary's View
 * report (`reportHref`, `onViewReport`) opens the Reconciliation Report with its Statement
 * filter set to this reconciliation; its key R is in the same `list` scope.
 */
export function useReconcileScreen(id: string) {
    const [
        reconciliationsCollection,
        accountsCollection,
        accessCollection,
        connectionsCollection,
        transactionsCollection,
    ] = useStore(
        'books_reconciliations',
        'books_accounts',
        'books_access',
        'books_bank_connections',
        'books_bank_transactions'
    )
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const isWide = useBreakpoint() !== 'mobile'
    const popToAccounts = usePopToScreenBelow(ACCOUNTS_ROUTE)
    const isBandOpen = useReconcileStore(s => s.isBandOpen)
    const toggleBand = useReconcileStore(s => s.toggleBand)
    const areHintsOpen = useReconcileStore(s => s.areHintsOpen)
    const toggleHints = useReconcileStore(s => s.toggleHints)

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
                    // Edit info's date rule: the account's latest finished statement.
                    lastFinished: materialize(
                        q
                            .from({ f: reconciliationsCollection })
                            .where(({ f }) =>
                                and(eq(f.account, r.account), eq(f.status, 'finished'))
                            )
                            .orderBy(({ f }) => f.statement_date, 'desc')
                            .select(({ f }) => ({ statement_date: f.statement_date }))
                            .findOne()
                    ),
                }))
                .findOne(),
        queryKey: ['books.reconcile.record', id],
    })
    const reconciliation = recordQuery.isError ? undefined : recordQuery.data
    const isFinishing = useReconcileStore(s => isFinishingFor(s, id))
    const isDiscarding = useReconcileStore(s => s.isDiscarding)
    const heldDate = useReconcileStore(s => heldStatementDate(s, id))
    // While Finish is sent the optimistic row reads finished; the screen stays the work
    // screen, with its lines and their sums, until the server has answered.
    const isFinished = reconciliation?.status === 'finished' && !isFinishing
    const workRecord = useMemo(
        () =>
            reconciliation && !isFinished
                ? { ...reconciliation, status: 'in_progress' as const }
                : reconciliation,
        [reconciliation, isFinished]
    )
    // While Edit info's save is in flight the optimistic row has the new date; the lines and
    // the For review count stay those of the stored date until the server has answered, so
    // the screen does not load again under the open dialog and a refusal shows in it.
    const readRecord = useMemo(
        () =>
            workRecord && heldDate !== null
                ? { ...workRecord, statement_date: heldDate }
                : workRecord,
        [workRecord, heldDate]
    )
    const lines = useReconcileLines(readRecord)

    // The For review hint (key `books.reconcile.review`): the account's bank connection with
    // its For review transactions dated on or before the statement date, through
    // `materialize()` by the connection, so only that connection's transactions load; the
    // count is their number.
    const statementAccount = reconciliation?.account ?? ''
    const statementDate = readRecord?.statement_date ?? ''
    const isReviewEnabled = workRecord !== undefined && !isFinished
    const reviewQuery = useLiveQuery({
        query: q => {
            if (!isReviewEnabled) return undefined
            return q
                .from({ c: connectionsCollection })
                .where(({ c }) => eq(c.account, statementAccount))
                .select(({ c }) => ({
                    id: c.id,
                    review: materialize(
                        q
                            .from({ t: transactionsCollection })
                            .where(({ t }) =>
                                and(
                                    eq(t.connection, c.id),
                                    eq(t.status, 'for_review'),
                                    lte(t.date, statementDate)
                                )
                            )
                            .select(({ t }) => ({ id: t.id }))
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.reconcile.review', statementAccount, statementDate, isReviewEnabled],
    })
    const isReviewError = isReviewEnabled && reviewQuery.isError
    const connection = isReviewError ? undefined : reviewQuery.data
    const reviewCount = connection?.review?.length ?? 0

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
    const state = screenState({
        isError: recordQuery.isError || lines.isError || access.isError || isReviewError,
        isRecordReady: recordQuery.isReady && access.isReady,
        hasRecord: reconciliation !== undefined,
        isDiscarding,
        isFinished,
        isLinesLoading: lines.isLoading,
    })
    // Memoized with the cleared count below: each is a pass over every line (spec §4, up to
    // 20,000), and a keystroke in the search must not run them again.
    const totals = useMemo(
        () => totalsOf(workRecord, lines.rows, accountType),
        [workRecord, lines.rows, accountType]
    )
    const clearedCount = useMemo(() => lines.rows.filter(row => row.isCleared).length, [lines.rows])
    const currency = reconciliation?.currency || account?.currency || 'USD'

    // The list: the filters as typed, the search applied after a pause in typing.
    const filters = useReconcileStore(s => s.filters)
    const sort = useReconcileStore(s => s.sort)
    const focusedLineId = useReconcileStore(s => s.focusedLineId)
    // A result of another reconciliation (a batch that settled after this one opened) is
    // not this screen's.
    const result = useReconcileStore(s => resultFor(s, id))
    // A cleared search applies at once (Clear filters, a hint's Show), so the row a Show
    // scrolls to is in the list it scrolls.
    const typedSearch = useDebouncedValue(filters.search, SEARCH_DELAY_MS)
    const appliedSearch = filters.search === '' ? '' : typedSearch
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
        isPaused: isFinishing,
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
        isEnabled: state === 'work' && !isFinishing,
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
                  sources: [reconciliationsCollection, accountsCollection],
              }
            : NO_RECOVERY
        const accessRecovery: LiveRecovery = access.isError
            ? { queries: [access.collection], sources: [accessCollection] }
            : NO_RECOVERY
        const reviewRecovery: LiveRecovery = isReviewError
            ? {
                  queries: [reviewQuery.collection],
                  sources: [connectionsCollection, transactionsCollection],
              }
            : NO_RECOVERY
        void recoverLiveQueries({
            ...mergeRecoveries([recordRecovery, lines.recovery, accessRecovery, reviewRecovery]),
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }
    const onBack = () => {
        if (popToAccounts()) return
        router.replace(orgHref('books/reconcile'))
    }

    const connectionId = connection?.id ?? ''
    const hints = useMemo(
        () =>
            totals && state === 'work'
                ? reconcileHints(lines.rows, totals, reviewCount, {
                      accountType,
                      statementDate,
                      currency,
                      connectionId,
                  })
                : [],
        [lines.rows, totals, state, reviewCount, accountType, statementDate, currency, connectionId]
    )
    const actions = useReconcileActions({
        reconciliationId: id,
        rows: lines.rows,
        sort,
        currency,
        difference: totals?.difference ?? null,
        isBatchRunning: clear.isBatchRunning,
        canWrite,
        listScrollRef,
        connectionId,
        onBack,
    })
    // On a phone Edit info and Finish later are More menu items (a writer's reconciliation in
    // progress, as ReconcileHeader draws them); their keys follow the items.
    const hasPhoneMenu = !isWide && canWrite && state === 'work'
    const phoneKeys: ReconcileHeaderKey[] = []
    if (hasPhoneMenu && !actions.isActionDisabled) phoneKeys.push('edit')
    if (hasPhoneMenu) phoneKeys.push('later')
    useReconcileHeaderKeys({
        owner: scopeOwner,
        offered: phoneKeys,
        onEdit: actions.onEdit,
        onLater: actions.onLater,
    })
    const editTarget: ReconcileEditTarget | null =
        actions.isEditOpen && reconciliation && state === 'work'
            ? {
                  reconciliation,
                  accountType,
                  currency,
                  lastDate: reconciliation.lastFinished?.statement_date ?? '',
                  rows: lines.rows,
              }
            : null
    // The stamped name, so the line stays after the finisher's user record is deleted.
    const finishedText = reconciliation
        ? finishedByText(localDayOf(reconciliation.finished_at), reconciliation.finished_by_name)
        : ''
    const onViewRegister = () => router.push(orgHref(`books/accounts/${statementAccount}`))
    // The Reconciliation Report with its Statement filter set to this reconciliation; null
    // while it loads or when the reader has no such report, and then no button is drawn.
    const reportParams = useMemo(() => ({ statement: id }), [id])
    const reportHref = useShippedReportHref(RECONCILIATION_REPORT_SHIPPED_KEY, reportParams)
    const onViewReport = () => {
        if (reportHref) router.push(reportHref)
    }
    // The account's history (reconciliation report spec §3 "The finished summary").
    const onOpenHistory = () =>
        router.push(orgHref('books/reconcile/history', { account: statementAccount }))

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
        hints,
        areHintsOpen,
        onToggleHints: toggleHints,
        actions,
        canFinish: actions.canFinish,
        isFinishing,
        onFinish: actions.onFinish,
        onLater: actions.onLater,
        onEdit: actions.onEdit,
        onDiscard: actions.onDiscard,
        onShowHint: actions.onShowHint,
        editTarget,
        // The Discard confirm's count: the cleared rows the delete removes.
        clearedCount,
        finishedText,
        onAnother: onBack,
        onViewRegister,
        reportHref,
        onViewReport,
        onOpenHistory,
    }
}

export type ReconcileScreenModel = ReturnType<typeof useReconcileScreen>
