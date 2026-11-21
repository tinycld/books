import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
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
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { MatchedView } from './useBankMatch'

// Writes in flight at once: enough to move a large choice quickly, few enough that the
// browser's connection limit and the server see a steady flow.
const BATCH_SIZE = 50

// `summary` is the selection bar's text of the choice as it was sent. `origin` names the
// control that started the run: the selection bar stays up, busy, for its own run only.
// A match run gives each id its journal lines in `matchLines`, and `skipped` counts the
// chosen rows it does not send (no single suggestion), for the result line. An undo run
// gives each id the id of its books_bank_matches row in `matchIds`; the drawer's undo also
// carries the Matched to section as it showed it (`undoShown`), which the section shows
// while the run is in flight, as the optimistic delete takes the match row from the store.
export type ReviewBatchInput = {
    kind: BatchKind
    ids: readonly string[]
    summary: string
    origin: 'bar' | 'drawer'
    matchLines?: Readonly<Record<string, readonly string[]>>
    matchIds?: Readonly<Record<string, string>>
    undoShown?: MatchedView
    skipped?: number
}

const NOT_SENT_TEXT: Record<BatchKind, string> = {
    exclude: 'bank transaction status change not sent',
    restore: 'bank transaction status change not sent',
    match: 'bank match not sent',
    unmatch: 'bank match undo not sent',
}

// Exclude or Move to For review of many transactions: each is a pbtsdb update of its
// status (optimistic, so the rows leave the tab at once), 50 at a time. A refused row is
// rolled back by pbtsdb and goes back into the list. A match is a pbtsdb insert of one
// books_bank_matches row for each id; the client writes no status: the server moves the
// transaction to Reviewed and realtime brings the change. An undo is a pbtsdb delete of
// the id's match row; the server moves the transaction back to For review (its match
// lines go by the cascade). The run never throws: it
// returns which ids went through and why the others did not, so the caller can keep the
// failed rows chosen.
//
// The mutation is an async function, not a generator: core's drainTransactions awaits a
// yielded array with Promise.all, which rejects at the first refused transaction
// (TanStack DB rejects `when('settled')` of a failed transaction,
// @tanstack/db/src/transactions.ts rollback), so a generator could not resume to read
// the others' outcome.
export function useReviewBatch() {
    const [txns, matches] = useStore('books_bank_transactions', 'books_bank_matches')

    // Starts the write of one id, or throws when there is nothing to send: a moved row that
    // is no longer in the store (it left by realtime), a match id with no lines, or an
    // undo id with no match row.
    const startWrite = (input: ReviewBatchInput, id: string) => {
        if (input.kind === 'unmatch') {
            const matchId = input.matchIds?.[id]
            if (!matchId) throw new Error('no match to undo')
            return matches.delete(matchId)
        }
        if (input.kind === 'match') {
            const lines = input.matchLines?.[id] ?? []
            const [first, ...rest] = lines
            if (first === undefined) throw new Error('no lines to match')
            return matches.insert({
                id: newRecordId(),
                bank_transaction: id,
                lines: [first, ...rest],
            })
        }
        const target = BATCH_TARGET[input.kind]
        return txns.update(id, draft => {
            draft.status = target
        })
    }

    const updateChunk = async (input: ReviewBatchInput, ids: readonly string[]) => {
        const done: string[] = []
        const failed: BatchFailure[] = []
        const started = ids.flatMap(id => {
            try {
                return [{ id, tx: startWrite(input, id) }]
            } catch {
                // Nothing was sent for this id. TanStack DB's own error text is not for the
                // user, so the failure has no message and the result line counts it.
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
        mutationFn: async (input: ReviewBatchInput): Promise<BatchRun> => {
            const outcome: BatchOutcome = { done: [], failed: [] }
            for (const chunk of chunksOf(input.ids, BATCH_SIZE)) {
                const step = await updateChunk(input, chunk)
                outcome.done.push(...step.done)
                outcome.failed.push(...step.failed)
            }
            const unsent = outcome.failed.filter(failure => failure.isTransport)
            if (unsent.length > 0) {
                log.warn('books.banking', NOT_SENT_TEXT[input.kind], {
                    kind: input.kind,
                    failed: unsent.length,
                })
            }
            return { outcome, isShownByDrawer: drawerShowsFailure(input, outcome) }
        },
    })

    // One run at a time. The callers' `isPending` checks read the last render, so two key
    // presses in one frame could each start a run. The run in flight is held here from the
    // moment it starts, so a second call sends nothing and gets the outcome of that run
    // (its caller then applies the same outcome a second time, which changes nothing).
    const inFlight = useRef<Promise<BatchOutcome> | null>(null)
    const setAddedNote = useBankingUIStore(s => s.setAddedNote)
    const setFailedNote = useBankingUIStore(s => s.setFailedNote)
    // A run's result line takes the place of the last Categorize's "Added …" or failed line.
    const run = (input: ReviewBatchInput): Promise<BatchOutcome> => {
        if (inFlight.current) return inFlight.current
        setAddedNote(null)
        setFailedNote(null)
        const started = mutation
            .mutateAsync(input)
            .then(done => done.outcome)
            .finally(() => {
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
        mutation.data && mutation.variables && !isHidden && !mutation.data.isShownByDrawer
            ? batchResultText(
                  mutation.variables.kind,
                  mutation.data.outcome,
                  mutation.variables.skipped ?? 0
              )
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

// The outcome of a run and whether the drawer shows its failure itself.
type BatchRun = { outcome: BatchOutcome; isShownByDrawer: boolean }

// A match or an undo from the drawer that failed keeps the drawer open, which shows the
// failure itself (useBankMatch's settle), so the result line stays empty. That holds only
// while the drawer still shows that transaction when the run ends: after Esc, a close or
// another row, the result line shows the failure, or it would show nowhere.
function drawerShowsFailure(input: ReviewBatchInput, outcome: BatchOutcome): boolean {
    const isMatchKind = input.kind === 'match' || input.kind === 'unmatch'
    if (input.origin !== 'drawer' || !isMatchKind) return false
    if (outcome.failed.length === 0) return false
    const openId = useBankingUIStore.getState().openTxnId
    return openId !== null && input.ids.includes(openId)
}

function failedReason(result: PromiseSettledResult<unknown>): unknown {
    return result.status === 'rejected' ? result.reason : undefined
}
