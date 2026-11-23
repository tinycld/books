import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import type { RefObject } from 'react'
import type { ListScrollHandle } from '../components/ListTable'
import {
    RECONCILE_DEFAULT_FILTERS,
    RECONCILE_TEXTS,
    type ReconcileSort,
    shownRows,
} from '../lib/reconcile'
import type { ReconcileHint } from '../lib/reconcile-hints'
import { writeRefusalText } from '../lib/refusal'
import { isFinishingFor, useReconcileStore } from '../stores/reconcile-store'
import type { ReconcileLineRow } from './useReconcileLines'

const LOG_CONTEXT = 'books.reconcile'

export type ReconcileActionsInput = {
    reconciliationId: string
    rows: readonly ReconcileLineRow[]
    sort: ReconcileSort
    currency: string
    // null before the totals are known.
    difference: number | null
    isBatchRunning: boolean
    canWrite: boolean
    listScrollRef: RefObject<ListScrollHandle | null>
    // The account's bank connection, for Open Banking; '' when it has none.
    connectionId: string
    onBack: () => void
}

/**
 * The work screen's header actions and the hint line's actions (reconcile spec §3 "Edit
 * info", "Finish later", "Finish", "Discard", "Hints", §4 "Writes").
 *
 * Finish is offered only at a difference of 0, while no batch runs, no finish of this
 * reconciliation is in flight and the server takes writes (core useServerActionState). A
 * press adds the reconciliation to the store's `finishingIds` before its one `update`
 * (`{ status: 'finished' }`), so the render the optimistic row triggers keeps the work screen
 * (useReconcileScreen); the server's row then makes the route show the finished summary. A
 * refusal goes to the result line; the id comes off when the update settles.
 *
 * Discard asks first (ConfirmDialog); its one `delete` removes the reconciliation, and the
 * server deletes its cleared rows with it. After the server answered, the cleared rows are
 * evicted from the store (`evictRows`), which removes them at once whatever realtime sends.
 * `isDiscarding` is set before the delete, so the screen does not read "not found" for its
 * own delete, and stays until the screen loses focus; after the server answered, the screen
 * goes back (onBack). A refusal closes the confirm and goes to the result line.
 *
 * Edit info opens the statement dialog in its edit mode, Finish later is onBack. A hint's
 * action: `show-row` clears the filters, focuses the row and scrolls to it; `show-amount`
 * clears the filters and puts the amount in the search; `banking` opens the connection's For
 * review tab. While the server takes no writes, `writeHint` is core's reason, which the More
 * menu's Edit info and Discard show as their description.
 */
export function useReconcileActions(input: ReconcileActionsInput) {
    const [reconciliationsCollection, clearedCollection] = useStore(
        'books_reconciliations',
        'books_reconciliation_lines'
    )
    const orgHref = useOrgHref()
    const writes = useServerActionState()
    const { reconciliationId: id } = input
    const isFinishing = useReconcileStore(s => isFinishingFor(s, id))
    const isDiscarding = useReconcileStore(s => s.isDiscarding)
    const isEditOpen = useReconcileStore(s => s.isEditOpen)
    const isDiscardOpen = useReconcileStore(s => s.isDiscardOpen)
    const isBalanced = input.difference === 0
    const isBusy = input.isBatchRunning || isFinishing || isDiscarding
    const isActionDisabled = !input.canWrite || isBusy || writes.isDisabled
    const canFinish = isBalanced && !isActionDisabled

    const finish = useMutation({
        mutationFn: function* (target: string) {
            yield reconciliationsCollection.update(target, draft => {
                draft.status = 'finished'
            })
        },
        // A supplied onError replaces core's default report, so the refusal is logged here.
        onError: (err, target) => {
            log.warn(LOG_CONTEXT, 'finish refused', { err })
            useReconcileStore
                .getState()
                .setResult(target, { text: writeRefusalText(err), tone: 'danger' })
        },
        onSettled: (_data, _err, target) => useReconcileStore.getState().endFinish(target),
    })

    const onFinish = () => {
        const store = useReconcileStore.getState()
        if (!canFinish || isFinishingFor(store, id)) return
        store.setResult(id, null)
        store.startFinish(id)
        finish.mutate(id)
    }

    const discard = useMutation({
        mutationFn: function* (variables: { target: string; clearedIds: readonly string[] }) {
            yield reconciliationsCollection.delete(variables.target)
        },
        onSuccess: (_data, { clearedIds }) => {
            evictRows(clearedCollection, clearedIds, LOG_CONTEXT)
            input.onBack()
        },
        onError: (err, { target }) => {
            log.warn(LOG_CONTEXT, 'discard refused', { err })
            const store = useReconcileStore.getState()
            store.setDiscarding(false)
            store.setDiscardOpen(false)
            store.setResult(target, { text: writeRefusalText(err), tone: 'danger' })
        },
    })

    const onConfirmDiscard = () => {
        const store = useReconcileStore.getState()
        if (store.isDiscarding || writes.isDisabled) return
        store.setResult(id, null)
        store.setDiscarding(true)
        const clearedIds = input.rows.flatMap(row => (row.isCleared ? [row.clearedId] : []))
        discard.mutate({ target: id, clearedIds })
    }

    const onEdit = () => {
        if (isActionDisabled) return
        const store = useReconcileStore.getState()
        store.setResult(id, null)
        store.setEditOpen(true)
    }
    const onDiscard = () => {
        if (isActionDisabled) return
        useReconcileStore.getState().setDiscardOpen(true)
    }
    // Cancel, Escape and the backdrop do nothing while the delete runs. The optimistic delete
    // removes the row at once, so the confirm (drawn only while the reconciliation is
    // loaded, ReconcileScreenView) is gone before the server answers; a refusal brings the
    // row back with the confirm closed and the refusal in the result line.
    const onCloseDiscard = () => {
        if (useReconcileStore.getState().isDiscarding) return
        useReconcileStore.getState().setDiscardOpen(false)
    }

    const showRow = (lineId: string) => {
        const store = useReconcileStore.getState()
        store.resetFilters()
        store.setFocusedLine(lineId)
        const all = shownRows(input.rows, RECONCILE_DEFAULT_FILTERS, input.sort, input.currency)
        const index = all.findIndex(row => row.id === lineId)
        if (index < 0) return
        // After the list has drawn the rows of the cleared filters.
        requestAnimationFrame(() => input.listScrollRef.current?.scrollToIndex(index))
    }

    const onShowHint = (hint: ReconcileHint) => {
        const action = hint.action
        if (!action) return
        if (action.kind === 'banking') {
            router.push(orgHref(`books/banking?account=${input.connectionId}&tab=review`))
            return
        }
        if (action.kind === 'show-row') {
            showRow(action.lineId ?? '')
            return
        }
        // The side tab or the Show choice could hide every row of that amount.
        const store = useReconcileStore.getState()
        store.resetFilters()
        store.setSearch(action.amount ?? '')
    }

    return {
        canFinish,
        isFinishing,
        isBalanced,
        // Edit info, Discard and the menu's items: disabled while a batch, a finish or a
        // discard runs, or the server takes no writes (with the core hint).
        isActionDisabled,
        // Core's reason while the server takes no writes; undefined while it does.
        writeHint: writes.isDisabled ? writes.accessibilityHint : undefined,
        finishHint: isBalanced ? undefined : RECONCILE_TEXTS.finishHint,
        isEditOpen,
        isDiscardOpen,
        isDiscarding,
        onFinish,
        onLater: input.onBack,
        onEdit,
        onDiscard,
        onConfirmDiscard,
        onCloseDiscard,
        onShowHint,
    }
}

export type ReconcileActions = ReturnType<typeof useReconcileActions>
