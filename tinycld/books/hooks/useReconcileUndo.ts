import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router, useLocalSearchParams } from 'expo-router'
import { materialize } from 'pbtsdb'
import { RECONCILE_TEXTS } from '../lib/reconcile'
import { undoDialogTexts, undoResultText } from '../lib/reconcile-history'
import { errorStatus, writeRefusalText } from '../lib/refusal'
import { useReconcileStore } from '../stores/reconcile-store'

const LOG_CONTEXT = 'books.reconcile'

export type UndoDialogState = 'closed' | 'loading' | 'error' | 'gone' | 'ask' | 'blocked'

// The dialog's failure text: the transport text for a write that never reached the server,
// else the server's refusal.
function undoFailureText(err: unknown): string {
    if (errorStatus(err) === 0) return RECONCILE_TEXTS.sendFailed
    return writeRefusalText(err)
}

/**
 * The undo dialog of a finished reconciliation (reconciliation report spec §3 "Undo", §4
 * "Writes"). The store's `undoTarget` opens it (the history's row menu, the finished
 * summary's More menu). One live query (key `books.reconcile.undo`) reads the target with its
 * account and the account's reconciliations in progress through `materialize()`; a load
 * error shows Retry. While another reconciliation of the account is in progress the dialog is
 * blocked: its text names that one, and Open it (`onOpenBlocking`) goes to its work screen.
 * A target that is no longer finished (another admin undid it) reads `gone`.
 *
 * The undo is one update (`status: 'in_progress'`). `startUndo` sets the store's
 * `undoingId` before it, so the render the optimistic row triggers keeps the dialog, the
 * history row and the finished summary until the server has answered; Cancel, Escape and
 * the backdrop do nothing meanwhile. A refusal (the server's text) or a transport failure
 * (RECONCILE_TEXTS.sendFailed) shows in the dialog. After the server's answer the result line
 * of the work screen reads `undoResultText` of the count read before the write, and the
 * route shows the work screen: pushed from the history, in place on the summary (its route
 * id is the target). While the server takes no writes, Undo is disabled (`writes`).
 */
export function useReconcileUndo() {
    const [reconciliationsCollection, accountsCollection] = useStore(
        'books_reconciliations',
        'books_accounts'
    )
    const orgHref = useOrgHref()
    const writes = useServerActionState()
    const params = useLocalSearchParams<{ id?: string }>()
    const target = useReconcileStore(s => s.undoTarget)
    const undoingId = useReconcileStore(s => s.undoingId)
    const error = useReconcileStore(s => s.undoError)
    const targetId = target ?? ''
    const isSending = target !== null && undoingId === target

    const query = useLiveQuery({
        query: q => {
            if (targetId === '') return undefined
            return q
                .from({ r: reconciliationsCollection })
                .where(({ r }) => eq(r.id, targetId))
                .select(({ r }) => ({
                    id: r.id,
                    account: r.account,
                    status: r.status,
                    statement_date: r.statement_date,
                    cleared_out_count: r.cleared_out_count,
                    cleared_in_count: r.cleared_in_count,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, r.account))
                            .select(({ a }) => ({ id: a.id, name: a.name, number: a.number }))
                            .findOne()
                    ),
                    inProgress: materialize(
                        q
                            .from({ o: reconciliationsCollection })
                            .where(({ o }) =>
                                and(eq(o.account, r.account), eq(o.status, 'in_progress'))
                            )
                            .select(({ o }) => ({ id: o.id, statement_date: o.statement_date }))
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.reconcile.undo', targetId],
    })

    const isError = targetId !== '' && query.isError
    const row = isError ? undefined : query.data
    // The optimistic undo makes the target itself in progress; it never blocks its own undo.
    const openOne = row?.inProgress?.find(other => other.id !== targetId)
    const account = row?.accountRow
    const texts = row && account ? undoDialogTexts(row, account, openOne) : null

    const state = dialogState({
        hasTarget: targetId !== '',
        isSending,
        isError,
        isReady: query.isReady,
        isFinished: row?.status === 'finished' && account !== undefined,
        isBlocked: texts?.isBlocked ?? false,
    })

    const undo = useMutation({
        mutationFn: function* (variables: { id: string; count: number }) {
            yield reconciliationsCollection.update(variables.id, draft => {
                draft.status = 'in_progress'
            })
        },
        onSuccess: (_data, { id, count }) => {
            const store = useReconcileStore.getState()
            store.setResult(id, { text: undoResultText(count), tone: 'muted' })
            store.endUndo()
            store.closeUndo()
            // On the summary the same route now draws the work screen.
            if (params.id !== id) router.push(orgHref(`books/reconcile/${id}`))
        },
        // A supplied onError replaces core's default report, so the failure is logged here.
        onError: (err, { id }) => {
            log.warn(LOG_CONTEXT, 'undo failed', { id, err })
            useReconcileStore.getState().setUndoError(undoFailureText(err))
        },
        onSettled: () => useReconcileStore.getState().endUndo(),
    })

    const onSubmit = () => {
        const store = useReconcileStore.getState()
        if (!row || state !== 'ask' || store.undoingId !== null || writes.isDisabled) return
        const count = row.cleared_out_count + row.cleared_in_count
        // Synchronous, before the optimistic write.
        store.startUndo(row.id)
        undo.mutate({ id: row.id, count })
    }
    const onClose = () => useReconcileStore.getState().closeUndo()
    const onOpenBlocking = () => {
        if (!openOne) return
        useReconcileStore.getState().closeUndo()
        router.push(orgHref(`books/reconcile/${openOne.id}`))
    }
    const onRetry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [reconciliationsCollection, accountsCollection],
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }

    return {
        target,
        state,
        isBlocked: state === 'blocked',
        isSending,
        error,
        texts,
        writes,
        onSubmit,
        onClose,
        onOpenBlocking,
        onRetry,
    }
}

// While the undo is sent the dialog keeps asking (the optimistic row is no longer finished).
function dialogState(input: {
    hasTarget: boolean
    isSending: boolean
    isError: boolean
    isReady: boolean
    isFinished: boolean
    isBlocked: boolean
}): UndoDialogState {
    if (!input.hasTarget) return 'closed'
    if (input.isSending) return 'ask'
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (!input.isFinished) return 'gone'
    return input.isBlocked ? 'blocked' : 'ask'
}

export type ReconcileUndoModel = ReturnType<typeof useReconcileUndo>
