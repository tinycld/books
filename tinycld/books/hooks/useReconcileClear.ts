import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { newRecordId } from 'pbtsdb/core'
import { useRef } from 'react'
import { type BatchFailure, batchFailure, chunksOf } from '../lib/bank-review'
import {
    allShownState,
    batchResultText,
    matchedOpenRows,
    RECONCILE_TEXTS,
    type ReconcileBatchAction,
} from '../lib/reconcile'
import { isBatchRunningFor, useReconcileStore } from '../stores/reconcile-store'
import type { ReconcileLineRow } from './useReconcileLines'

const LOG_CONTEXT = 'books.reconcile'

// Writes in flight at once, as useReviewBatch: enough to clear a long statement quickly,
// few enough that the browser's connection limit and the server see a steady flow.
const BATCH_SIZE = 50

type StepOutcome = { done: number; failed: BatchFailure[] }
type RowOutcome = { failure: BatchFailure | null }

// The message the result line reads for one failure: the server's refusal, or the
// transport text for a write that never reached the server.
function failureMessage(failure: BatchFailure): string {
    return failure.isTransport ? RECONCILE_TEXTS.sendFailed : failure.message
}

function logUnsent(failed: readonly BatchFailure[], action: ReconcileBatchAction) {
    const unsent = failed.filter(failure => failure.isTransport).length
    if (unsent > 0) log.warn(LOG_CONTEXT, 'cleared mark change not sent', { action, unsent })
}

export type ReconcileClearInput = {
    reconciliationId: string
    // Every row of the lines query, for Clear matched (whatever the filters).
    rows: readonly ReconcileLineRow[]
    // The rows the list shows under the filters, for the header box and A.
    shown: readonly ReconcileLineRow[]
    canWrite: boolean
}

/**
 * Clearing on the work screen (reconcile spec §3 "Clearing", §4 "Writes"). A press inserts
 * one books_reconciliation_lines row (`{ id, reconciliation, line }`) or deletes the row's
 * own one by `clearedId`; pbtsdb shows it at once and rolls it back by itself when the
 * server refuses, and the result line then reads the server's message (a transport failure
 * logs and reads RECONCILE_TEXTS.sendFailed). Clear all shown (the header box, "Clear all
 * shown", A) clears the shown rows that are not cleared, or unclears them all when every
 * shown row is cleared; Clear matched (M) clears every matched row that is not cleared,
 * whatever the filters. A batch takes the rows of the render it was pressed in, adds its
 * reconciliation to the store's `runningBatchIds` before its first write (so that render
 * already disables the rows, the boxes and Clear matched), runs 50 writes at a time in
 * parallel, and the result line reads `batchResultText` of its `{ done, failed }`. The
 * batch flag and the result are stamped with the reconciliation the press was made on, so
 * a batch that settles after the screen shows another reconciliation neither disables it
 * nor writes on its result line. While a batch runs or the server takes no writes (core
 * useServerActionState, whose hint goes on the controls), every control here is disabled;
 * a reader gets none. A write on a row whose previous write is still in flight waits for
 * it, and is skipped when the row is then already in the state it asks for.
 *
 * Each write is awaited on its own and its failure caught, not through
 * `performMutations`: core's drain awaits a yielded array with Promise.all, which rejects
 * at the first refused write, so the outcome of the others could not be read (as
 * useReviewBatch explains).
 */
export function useReconcileClear(input: ReconcileClearInput) {
    const [clearedCollection] = useStore('books_reconciliation_lines')
    const { reconciliationId } = input
    const isBatchRunning = useReconcileStore(s => isBatchRunningFor(s, reconciliationId))
    const startBatch = useReconcileStore(s => s.startBatch)
    const endBatch = useReconcileStore(s => s.endBatch)
    const setResult = useReconcileStore(s => s.setResult)
    const writes = useServerActionState()
    const isControlDisabled = !input.canWrite || isBatchRunning || writes.isDisabled

    const startWrite = (row: ReconcileLineRow, action: ReconcileBatchAction, target: string) => {
        if (action === 'unclear') return clearedCollection.delete(row.clearedId)
        return clearedCollection.insert({
            id: newRecordId(),
            reconciliation: target,
            line: row.id,
        })
    }

    // The write in flight for each line. A second press on a row while its first write is
    // in flight waits for it: an unclear right after a clear must not send its delete
    // before the insert it undoes has settled (pbtsdb would land the insert's row after the
    // delete removed it, and the row would show cleared while the server has no row).
    const inFlight = useRef(new Map<string, Promise<void>>())

    // After a wait, the row may already be in the state the press asked for (the first
    // write was refused and rolled back, or another press got there): a one-time read of
    // the collection, which holds the optimistic rows too.
    const isAlreadyDone = (row: ReconcileLineRow, action: ReconcileBatchAction) => {
        if (action === 'unclear') return !clearedCollection.has(row.clearedId)
        return clearedCollection.toArray.some(cleared => cleared.line === row.id)
    }

    // Reads the row's previous write before its first await, so a row with nothing in
    // flight starts its write (and its optimistic change) at once.
    const writeRow = async (
        row: ReconcileLineRow,
        action: ReconcileBatchAction,
        target: string,
        previous: Promise<void> | undefined
    ): Promise<RowOutcome> => {
        if (previous) {
            await previous
            if (isAlreadyDone(row, action)) return { failure: null }
        }
        let tx: ReturnType<typeof startWrite>
        try {
            tx = startWrite(row, action, target)
        } catch (err) {
            // Nothing was sent for this row (pbtsdb refused the write locally).
            log.warn(LOG_CONTEXT, 'cleared mark change not started', { err })
            return { failure: { id: row.id, message: '', isTransport: true } }
        }
        try {
            await tx.when('settled')
        } catch (err) {
            return { failure: batchFailure(row.id, tx.error?.error ?? err) }
        }
        if (tx.state === 'failed') return { failure: batchFailure(row.id, tx.error?.error) }
        return { failure: null }
    }

    const queueWrite = (row: ReconcileLineRow, action: ReconcileBatchAction, target: string) => {
        const outcome = writeRow(row, action, target, inFlight.current.get(row.id))
        const settled = outcome.then(() => undefined)
        inFlight.current.set(row.id, settled)
        void settled.then(() => {
            if (inFlight.current.get(row.id) === settled) inFlight.current.delete(row.id)
        })
        return outcome
    }

    // `target` is the reconciliation the press or batch was made on; its writes and its
    // result belong to it even when it settles after the screen shows another one.
    const runStep = async (
        rows: readonly ReconcileLineRow[],
        action: ReconcileBatchAction,
        target: string
    ): Promise<StepOutcome> => {
        const outcomes = await Promise.all(rows.map(row => queueWrite(row, action, target)))
        const failed = outcomes.flatMap(({ failure }) => (failure ? [failure] : []))
        return { done: outcomes.length - failed.length, failed }
    }

    const press = useMutation({
        mutationFn: (variables: {
            row: ReconcileLineRow
            action: ReconcileBatchAction
            target: string
        }) => runStep([variables.row], variables.action, variables.target),
        onSuccess: (outcome, variables) => {
            const [failure] = outcome.failed
            if (!failure) return
            logUnsent(outcome.failed, variables.action)
            setResult(variables.target, { text: failureMessage(failure), tone: 'danger' })
        },
        onError: (err, variables) => {
            log.warn(LOG_CONTEXT, 'cleared mark change failed', { err })
            setResult(variables.target, { text: RECONCILE_TEXTS.sendFailed, tone: 'danger' })
        },
    })

    const batch = useMutation({
        mutationFn: async (variables: {
            rows: readonly ReconcileLineRow[]
            action: ReconcileBatchAction
            target: string
        }) => {
            let done = 0
            const failed: BatchFailure[] = []
            for (const chunk of chunksOf(variables.rows, BATCH_SIZE)) {
                const step = await runStep(chunk, variables.action, variables.target)
                done += step.done
                failed.push(...step.failed)
            }
            return { done, failed }
        },
        onSuccess: (outcome, variables) => {
            logUnsent(outcome.failed, variables.action)
            const text = batchResultText({
                action: variables.action,
                done: outcome.done,
                failed: outcome.failed.length,
                messages: outcome.failed.map(failureMessage),
            })
            const tone = outcome.failed.length > 0 ? 'danger' : 'muted'
            setResult(variables.target, { text, tone })
        },
        onError: (err, variables) => {
            log.warn(LOG_CONTEXT, 'cleared mark batch failed', { err })
            setResult(variables.target, { text: RECONCILE_TEXTS.sendFailed, tone: 'danger' })
        },
        onSettled: (_outcome, _err, variables) => endBatch(variables.target),
    })

    // The store is read, not the render's value: two presses in one frame start one batch.
    const isBlockedNow = () =>
        isControlDisabled || isBatchRunningFor(useReconcileStore.getState(), reconciliationId)

    const runBatch = (rows: readonly ReconcileLineRow[], action: ReconcileBatchAction) => {
        if (isBlockedNow() || rows.length === 0) return
        setResult(reconciliationId, null)
        startBatch(reconciliationId)
        batch.mutate({ rows, action, target: reconciliationId })
    }

    const onToggle = (lineId: string) => {
        if (isBlockedNow()) return
        const row = input.rows.find(candidate => candidate.id === lineId)
        if (!row) return
        setResult(reconciliationId, null)
        press.mutate({
            row,
            action: row.isCleared ? 'unclear' : 'clear',
            target: reconciliationId,
        })
    }

    const allShown = allShownState(input.shown)
    const onToggleAllShown = () => {
        if (allShown === 'checked') runBatch(input.shown, 'unclear')
        else
            runBatch(
                input.shown.filter(row => !row.isCleared),
                'clear'
            )
    }

    const matched = matchedOpenRows(input.rows)
    const onClearMatched = () => runBatch(matched, 'clear')

    return {
        onToggle,
        onToggleAllShown,
        onClearMatched,
        isBatchRunning,
        allShownState: allShown,
        matchedCount: matched.length,
        // The rows, the boxes and Clear matched are disabled with this hint.
        isControlDisabled,
        writeHint: writes.accessibilityHint,
        // The server takes no writes now.
        isWriteBlocked: writes.isDisabled,
    }
}

export type ReconcileClear = ReturnType<typeof useReconcileClear>
