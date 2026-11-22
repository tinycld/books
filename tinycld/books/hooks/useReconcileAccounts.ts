import { and, coalesce, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { topLayer } from '@tinycld/core/ui/overlay/layer-stack'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { materialize } from 'pbtsdb'
import { type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { compareNumbers, compareText } from '../lib/account-tree'
import { accountBalanceTotals } from '../lib/accounts-query'
import { movedFocus } from '../lib/list-shortcuts'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import {
    accountParamTarget,
    offeredAccountKeyActions,
    RECONCILE_ACCOUNT_KEY_LABELS,
    RECONCILE_ACCOUNT_KEYS,
    RECONCILE_ACCOUNT_TYPES,
    type ReconcileAccountKeyAction,
} from '../lib/reconcile'
import { useReconcileStore } from '../stores/reconcile-store'
import { useBooksAccess } from './useBooksAccess'

const LOG_CONTEXT = 'books.reconcile'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_SHORTCUTS: Shortcut[] = []
const RECONCILE_TYPES = [...RECONCILE_ACCOUNT_TYPES]

export type ReconcileAccountsState = 'loading' | 'error' | 'empty' | 'list'

// What a row's button (and a press on the row) does: start a reconciliation (a writer, none
// in progress), resume one (a writer) or view it (a reader), or nothing (a reader, none in
// progress).
export type ReconcileRowAction = 'start' | 'resume' | 'view' | 'none'

type KeyAction = ReconcileAccountKeyAction

// A menu or popover pushes no scope: core marks it only in the layer stack, as the top
// layer that is not modal. Read at press time.
function noMenuLayerOpen(): boolean {
    const layer = topLayer()
    return layer === null || layer.isModal
}

// A mouse press leaves DOM focus on the pressed row or button, and react-native-web presses
// that element on plain Enter before the list sees the key. A movement key makes the
// focused row the place ↵ acts on, so it drops that focus (as useReviewShortcuts does).
function releaseDomFocus() {
    if (typeof document === 'undefined') return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return
    if (active.isContentEditable || active.matches('input, textarea, select')) return
    active.blur()
}

function relayTo(ref: RefObject<Record<KeyAction, () => void>>): Record<KeyAction, () => void> {
    return {
        next: () => ref.current.next(),
        previous: () => ref.current.previous(),
        open: () => ref.current.open(),
    }
}

function rowActionOf(hasInProgress: boolean, canWrite: boolean): ReconcileRowAction {
    if (hasInProgress) return canWrite ? 'resume' : 'view'
    return canWrite ? 'start' : 'none'
}

function screenState(input: {
    isError: boolean
    isReady: boolean
    rowCount: number
}): ReconcileAccountsState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    return input.rowCount === 0 ? 'empty' : 'list'
}

/**
 * The accounts screen of `books/reconcile` (reconcile spec §3 "The accounts screen", §2,
 * §4 "Reads"). One live query: the active bank and credit card accounts in chart order
 * (number-less last, numbers numerically, then name, then id: the compares of
 * lib/account-tree.ts), each with its balance (the account's books_account_balances rows
 * summed, as lib/accounts-query.ts does), its reconciliation in progress, its latest
 * finished one and its bank connection, each through `materialize()`. The route parameter
 * `account` goes through `accountParamTarget`: the work screen of the account's
 * reconciliation in progress replaces this screen, or the start dialog opens once; an
 * inactive account's reconciliation in progress is read by one more query, which runs only
 * for a writer whose parameter names no listed account. The keys ↓ / J, ↑ / K and ↵ are
 * registered in the screen's `list` scope while the list shows and no dialog is open.
 */
export function useReconcileAccounts() {
    const [
        accountsCollection,
        balancesCollection,
        reconciliationsCollection,
        connectionsCollection,
    ] = useStore(
        'books_accounts',
        'books_account_balances',
        'books_reconciliations',
        'books_bank_connections'
    )
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const canWrite = access.canWrite
    const orgHref = useOrgHref()
    const owner = useShortcutScope('list')
    const instance = useId()
    const startAccountId = useReconcileStore(s => s.startAccountId)
    const openStart = useReconcileStore(s => s.openStart)

    const accountsQuery = useLiveQuery({
        query: q => {
            const totals = accountBalanceTotals(q, balancesCollection)
            return q
                .from({ account: accountsCollection })
                .where(({ account }) =>
                    and(inArray(account.type, RECONCILE_TYPES), eq(account.inactive, false))
                )
                .leftJoin({ total: totals }, ({ account, total }) => eq(account.id, total.account))
                .orderBy(({ account }) => eq(account.number, ''))
                .orderBy(({ account }) => account.number, {
                    stringSort: 'custom',
                    compare: compareNumbers,
                })
                .orderBy(({ account }) => account.name, {
                    stringSort: 'custom',
                    compare: compareText,
                })
                .orderBy(({ account }) => account.id, { stringSort: 'lexical' })
                .select(({ account, total }) => ({
                    id: account.id,
                    name: account.name,
                    number: account.number,
                    type: account.type,
                    detail_type: account.detail_type,
                    currency: account.currency,
                    debit_total: coalesce(total?.debit_total, 0),
                    credit_total: coalesce(total?.credit_total, 0),
                    inProgress: materialize(
                        q
                            .from({ r: reconciliationsCollection })
                            .where(({ r }) =>
                                and(eq(r.account, account.id), eq(r.status, 'in_progress'))
                            )
                            .select(({ r }) => ({ id: r.id, statement_date: r.statement_date }))
                            .findOne()
                    ),
                    lastFinished: materialize(
                        q
                            .from({ r: reconciliationsCollection })
                            .where(({ r }) =>
                                and(eq(r.account, account.id), eq(r.status, 'finished'))
                            )
                            .orderBy(({ r }) => r.statement_date, 'desc')
                            .select(({ r }) => ({
                                id: r.id,
                                statement_date: r.statement_date,
                                statement_balance: r.statement_balance,
                            }))
                            .findOne()
                    ),
                    connection: materialize(
                        q
                            .from({ c: connectionsCollection })
                            .where(({ c }) => eq(c.account, account.id))
                            .select(({ c }) => ({ id: c.id }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.reconcile.accounts'],
    })
    const isAccountsReady = accountsQuery.isReady && !accountsQuery.isError
    const rows = useMemo(
        () => (isAccountsReady ? (accountsQuery.data ?? []) : []),
        [isAccountsReady, accountsQuery.data]
    )
    type Row = (typeof rows)[number]

    // books/reconcile?account=<id>
    const params = useLocalSearchParams<{ account?: string }>()
    const paramId =
        typeof params.account === 'string' && params.account !== '' ? params.account : ''
    const isListed = rows.some(row => row.id === paramId)
    const needsParamRead = paramId !== '' && canWrite && isAccountsReady && !isListed
    const paramQuery = useLiveQuery({
        query: q => {
            if (!needsParamRead) return undefined
            return q
                .from({ r: reconciliationsCollection })
                .where(({ r }) => and(eq(r.account, paramId), eq(r.status, 'in_progress')))
                .select(({ r }) => ({ id: r.id, account: r.account }))
                .findOne()
        },
        queryKey: ['books.reconcile.param', paramId, needsParamRead],
    })
    // A failed read of the inactive account's reconciliation is the screen's error (with
    // Retry), not "none in progress".
    const isParamError = needsParamRead && paramQuery.isError
    const isParamSettled =
        paramId !== '' &&
        access.isReady &&
        isAccountsReady &&
        !isParamError &&
        (!needsParamRead || paramQuery.isReady)
    const target = isParamSettled
        ? accountParamTarget({
              accountId: paramId,
              canWrite,
              rows: rows.map(row => ({
                  account: { id: row.id, type: row.type },
                  inProgress: row.inProgress,
              })),
              paramInProgress: paramQuery.data,
          })
        : null
    const workTarget = target?.kind === 'work' ? target.id : ''
    const startTarget = target?.kind === 'start' ? target.accountId : ''
    useEffect(() => {
        if (workTarget !== '') {
            router.replace(orgHref(`books/reconcile/${workTarget}`))
            return
        }
        if (startTarget === '') return
        openStart(startTarget)
        // The dialog opens once: a later visit with the same parameter opens it again.
        router.setParams({ account: undefined })
    }, [workTarget, startTarget, orgHref, openStart])

    // The start dialog does not outlive the screen's focus (lesson 3), but stays while its
    // insert runs: the insert's end closes it.
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useReconcileStore.getState()
                if (!store.isStarting) store.closeStart()
            },
            []
        )
    )

    const state = screenState({
        isError: accountsQuery.isError || access.isError || isParamError,
        isReady: accountsQuery.isReady && access.isReady,
        rowCount: rows.length,
    })

    const onRetry = () => {
        const accountsRecovery: LiveRecovery = accountsQuery.isError
            ? {
                  queries: [accountsQuery.collection],
                  sources: [
                      accountsCollection,
                      balancesCollection,
                      reconciliationsCollection,
                      connectionsCollection,
                  ],
              }
            : NO_RECOVERY
        const accessRecovery: LiveRecovery = access.isError
            ? { queries: [access.collection], sources: [accessCollection] }
            : NO_RECOVERY
        const paramRecovery: LiveRecovery = isParamError
            ? { queries: [paramQuery.collection], sources: [reconciliationsCollection] }
            : NO_RECOVERY
        void recoverLiveQueries({
            ...mergeRecoveries([accountsRecovery, accessRecovery, paramRecovery]),
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }

    const openWork = (reconciliationId: string) =>
        router.push(orgHref(`books/reconcile/${reconciliationId}`))
    const actionOf = (row: Row) => rowActionOf(row.inProgress !== undefined, canWrite)
    const onRowPress = (row: Row) => {
        const action = actionOf(row)
        if (action === 'start') openStart(row.id)
        else if (row.inProgress && action !== 'none') openWork(row.inProgress.id)
    }
    const onThroughPress = (row: Row) => {
        if (row.lastFinished) openWork(row.lastFinished.id)
    }
    const onOpenChart = () => router.push(orgHref('books/accounts'))

    // The keyboard's row focus: local to this screen, and dropped when its row leaves.
    const [focusedId, setFocusedId] = useState('')
    const focusedIndex = rows.findIndex(row => row.id === focusedId)
    const run: Record<KeyAction, () => void> = {
        next: () => {
            releaseDomFocus()
            setFocusedId(movedFocus(rowIds(rows), focusedId, 1))
        },
        previous: () => {
            releaseDomFocus()
            setFocusedId(movedFocus(rowIds(rows), focusedId, -1))
        },
        open: () => {
            const row = rows[focusedIndex]
            if (row) onRowPress(row)
        },
    }
    const runRef = useRef(run)
    runRef.current = run
    const hasFocusedRow = focusedIndex >= 0
    const isKeyed = state === 'list' && startAccountId === null
    const shortcuts = useMemo(() => {
        if (!isKeyed) return NO_SHORTCUTS
        const relay = relayTo(runRef)
        return offeredAccountKeyActions(hasFocusedRow).flatMap(action =>
            RECONCILE_ACCOUNT_KEYS[action].map(key => ({
                id: `books.reconcile.accounts.${instance}.${action}.${key}`,
                keys: key,
                scope: 'list' as const,
                description: RECONCILE_ACCOUNT_KEY_LABELS[action],
                group: 'Reconcile',
                when: noMenuLayerOpen,
                run: () => relay[action](),
            }))
        )
    }, [isKeyed, hasFocusedRow, instance])
    useRegisterShortcuts(shortcuts, owner)

    const startRow = canWrite ? rows.find(row => row.id === startAccountId) : undefined

    return {
        state,
        rows,
        canWrite,
        onRetry,
        focusedId: hasFocusedRow ? focusedId : '',
        focusedIndex: hasFocusedRow ? focusedIndex : undefined,
        actionOf,
        onRowPress,
        onThroughPress,
        onOpenChart,
        startRow,
    }
}

function rowIds(rows: readonly { id: string }[]): string[] {
    return rows.map(row => row.id)
}

export type ReconcileAccountsModel = ReturnType<typeof useReconcileAccounts>
export type ReconcileAccountRowData = ReconcileAccountsModel['rows'][number]
