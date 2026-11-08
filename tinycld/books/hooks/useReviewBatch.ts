import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
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

export type ReviewBatchInput = { kind: BatchKind; ids: readonly string[]; summary: string }

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

    const result =
        mutation.data && mutation.variables
            ? batchResultText(mutation.variables.kind, mutation.data)
            : null
    const pending = mutation.isPending && mutation.variables ? mutation.variables : null

    return {
        run: mutation.mutateAsync,
        isPending: mutation.isPending,
        pending,
        result,
        clearResult: mutation.reset,
    }
}

export type ReviewBatch = ReturnType<typeof useReviewBatch>

function failedReason(result: PromiseSettledResult<unknown>): unknown {
    return result.status === 'rejected' ? result.reason : undefined
}
