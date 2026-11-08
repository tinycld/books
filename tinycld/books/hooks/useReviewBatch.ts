import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef, useState } from 'react'
import {
    BATCH_TARGET,
    type BatchFailure,
    type BatchKind,
    type BatchOutcome,
    batchFailure,
    batchResultText,
    chunksOf,
} from '../lib/bank-review'

// Writes in flight at once: enough to move a large choice quickly, few enough that the
// browser's connection limit and the server see a steady flow.
const BATCH_SIZE = 50

// `summary` is the selection bar's text of the choice as it was sent. `origin` names the
// control that started the run: the selection bar stays up, busy, for its own run only.
export type ReviewBatchInput = {
    kind: BatchKind
    ids: readonly string[]
    summary: string
    origin: 'bar' | 'drawer'
}

// Exclude or Move to For review of many transactions: each is a pbtsdb update of its
// status (optimistic, so the rows leave the tab at once), 50 at a time. A refused row is
// rolled back by pbtsdb and goes back into the list. The run never throws: it returns
// which ids went through and why the others did not, so the caller can keep the failed
// rows chosen.
//
// The mutation is an async function, not a generator: core's drainTransactions awaits a
// yielded array with Promise.all, which rejects at the first refused transaction
// (TanStack DB rejects `when('settled')` of a failed transaction,
// @tanstack/db/src/transactions.ts rollback), so a generator could not resume to read
// the others' outcome.
export function useReviewBatch() {
    const [txns] = useStore('books_bank_transactions')

    const updateChunk = async (kind: BatchKind, ids: readonly string[]) => {
        const done: string[] = []
        const failed: BatchFailure[] = []
        const started = ids.flatMap(id => {
            try {
                const tx = txns.update(id, draft => {
                    draft.status = BATCH_TARGET[kind]
                })
                return [{ id, tx }]
            } catch {
                // The row is no longer in the store (it left by realtime): nothing was sent.
                // TanStack DB's own error text is not for the user, so the failure has no
                // message and the result line counts it.
                failed.push({ id, message: '', isTransport: false })
                return []
            }
        })
        const settled = await Promise.allSettled(started.map(({ tx }) => tx.when('settled')))
        settled.forEach((result, i) => {
            const { id, tx } = started[i]
            if (result.status === 'fulfilled' && tx.state !== 'failed') done.push(id)
            else failed.push(batchFailure(id, tx.error?.error ?? failedReason(result)))
        })
        return { done, failed }
    }

    const mutation = useMutation({
        mutationFn: async ({ kind, ids }: ReviewBatchInput): Promise<BatchOutcome> => {
            const outcome: BatchOutcome = { done: [], failed: [] }
            for (const chunk of chunksOf(ids, BATCH_SIZE)) {
                const step = await updateChunk(kind, chunk)
                outcome.done.push(...step.done)
                outcome.failed.push(...step.failed)
            }
            const unsent = outcome.failed.filter(failure => failure.isTransport)
            if (unsent.length > 0) {
                log.warn('books.banking', 'bank transaction status change not sent', {
                    kind,
                    failed: unsent.length,
                })
            }
            return outcome
        },
    })

    // One run at a time. The callers' `isPending` checks read the last render, so two key
    // presses in one frame could each start a run. The run in flight is held here from the
    // moment it starts, so a second call sends nothing and gets the outcome of that run
    // (its caller then applies the same outcome a second time, which changes nothing).
    const inFlight = useRef<Promise<BatchOutcome> | null>(null)
    const run = (input: ReviewBatchInput): Promise<BatchOutcome> => {
        if (inFlight.current) return inFlight.current
        const started = mutation.mutateAsync(input).finally(() => {
            inFlight.current = null
        })
        inFlight.current = started
        return started
    }

    // A tab or account change hides the result line. A reset while a run is in flight would
    // also drop its pending state and free the controls before the run ends, so a run in
    // flight is only marked hidden, by its start time, and its result never shows.
    const [hiddenRun, setHiddenRun] = useState<number | null>(null)
    const isHidden = mutation.submittedAt === hiddenRun
    const result =
        mutation.data && mutation.variables && !isHidden
            ? batchResultText(mutation.variables.kind, mutation.data)
            : null
    const pending = mutation.isPending && mutation.variables ? mutation.variables : null
    const clearResult = () => {
        if (mutation.isPending) setHiddenRun(mutation.submittedAt)
        else mutation.reset()
    }

    return {
        run,
        isPending: mutation.isPending,
        pending,
        result,
        clearResult,
    }
}

export type ReviewBatch = ReturnType<typeof useReviewBatch>

function failedReason(result: PromiseSettledResult<unknown>): unknown {
    return result.status === 'rejected' ? result.reason : undefined
}
