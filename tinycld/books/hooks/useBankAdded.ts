import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { materialize } from 'pbtsdb'
import { accountLabel } from '../lib/account-options'
import {
    type AddedView,
    addedLineAmount,
    addedOnText,
    addedViewOf,
    undoAddedText,
} from '../lib/bank-categorize'
import { entryLabel } from '../lib/bank-match'
import { type BatchOutcome, batchResultText, writeControlState } from '../lib/bank-review'
import { entryHref } from '../lib/entry-route'
import { mergeRecoveries } from '../lib/live-recovery'
import { formatDay } from '../lib/register-range'
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { ReviewBatch } from './useReviewBatch'
import type { ReviewDrawerModel } from './useReviewDrawer'

// The categorization of one Reviewed bank transaction, with who made it, its posted entry,
// the entry's lines with their accounts, and its customer or vendor, in one query.
// Disabled while no Reviewed transaction is open.
function useAddedQuery(txnId: string | null) {
    const [categorizations, entries, lines, accounts, customers, vendors, users] = useStore(
        'books_bank_categorizations',
        'books_journal_entries',
        'books_journal_lines',
        'books_accounts',
        'books_customers',
        'books_vendors',
        'users'
    )
    const query = useLiveQuery({
        query: q => {
            if (!txnId) return null
            return q
                .from({ c: categorizations })
                .where(({ c }) => eq(c.bank_transaction, txnId))
                .select(({ c }) => ({
                    id: c.id,
                    kind: c.kind,
                    created: c.created,
                    user: materialize(
                        q
                            .from({ u: users })
                            .where(({ u }) => eq(u.id, c.created_by))
                            .select(({ u }) => ({ name: u.name }))
                            .findOne()
                    ),
                    entry: materialize(
                        q
                            .from({ e: entries })
                            .where(({ e }) => eq(e.id, c.entry))
                            .select(({ e }) => ({
                                id: e.id,
                                number: e.number,
                                doc_type: e.doc_type,
                                origin: e.origin,
                                document: e.document,
                                date: e.date,
                            }))
                            .findOne()
                    ),
                    lines: materialize(
                        q
                            .from({ l: lines })
                            .where(({ l }) => eq(l.entry, c.entry))
                            .select(({ l }) => ({
                                id: l.id,
                                position: l.position,
                                account: l.account,
                                debit: l.debit,
                                credit: l.credit,
                                memo: l.memo,
                                accountRow: materialize(
                                    q
                                        .from({ a: accounts })
                                        .where(({ a }) => eq(a.id, l.account))
                                        .select(({ a }) => ({ number: a.number, name: a.name }))
                                        .findOne()
                                ),
                            }))
                    ),
                    customerRow: materialize(
                        q
                            .from({ cu: customers })
                            .where(({ cu }) => eq(cu.id, c.customer))
                            .select(({ cu }) => ({ display_name: cu.display_name }))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        q
                            .from({ v: vendors })
                            .where(({ v }) => eq(v.id, c.vendor))
                            .select(({ v }) => ({ display_name: v.display_name }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.categorize.added', txnId],
    })
    return {
        query,
        sources: [categorizations, entries, lines, accounts, customers, vendors, users],
    }
}

type AddedRow = NonNullable<ReturnType<typeof useAddedQuery>['query']['data']>

type ShownInput = { bankAmount: number; connectionAccountId: string }

// The Books transaction as its link row: type and number, date, payee and the bank
// amount. Undefined until the entry has arrived.
function linkOf(row: AddedRow, bankAmount: number) {
    const { entry } = row
    if (!entry) return undefined
    return {
        lineId: entry.id,
        label: entryLabel(entry),
        href: entryHref(entry),
        dateText: formatDay(entry.date),
        name: row.customerRow?.display_name ?? row.vendorRow?.display_name ?? '',
        amount: Math.abs(bankAmount),
    }
}

// A categorized transaction's lines but the bank line, in order: account label, memo,
// amount as it was typed (addedLineAmount). A transfer shows its link row only.
function linesOf(row: AddedRow, input: ShownInput) {
    if (row.kind !== 'categorize') return []
    return [...(row.lines ?? [])]
        .filter(line => line.account !== input.connectionAccountId)
        .sort((a, b) => a.position - b.position)
        .map(line => ({
            id: line.id,
            label: line.accountRow ? accountLabel(line.accountRow) : '',
            memo: line.memo,
            amount: addedLineAmount(line, input.bankAmount),
        }))
}

// The Added to Books section as it shows one categorization: the id the undo deletes, the
// link row, the lines, who added it and when, and the result line of its undo.
function addedShownOf(row: AddedRow, input: ShownInput) {
    return {
        categorizationId: row.id,
        link: linkOf(row, input.bankAmount),
        lines: linesOf(row, input),
        byText: addedOnText(row.created, row.user?.name ?? ''),
        undoText: row.entry ? undoAddedText(row.entry) : '',
    }
}

export type AddedShown = ReturnType<typeof addedShownOf>
export type AddedLine = AddedShown['lines'][number]

function isUndoSending(pending: ReviewBatch['pending'], txnId: string | null): boolean {
    if (!pending || txnId === null) return false
    return (
        pending.origin === 'drawer' &&
        pending.kind === 'uncategorize' &&
        pending.ids.includes(txnId)
    )
}

type BankAddedInput = {
    drawer: ReviewDrawerModel
    canWrite: boolean
    batch: ReviewBatch
    // The connection's ledger account: the bank line of the entry, which the lines leave out.
    connectionAccountId: string
}

// The drawer's Added to Books section of a Reviewed transaction that was categorized or
// transferred: its read (loading, the load error with Retry), the Books transaction, the
// lines, who added it, and for a writer Undo, run through the page's one batch as a delete
// of the categorization (the server voids the entry and moves the transaction back to For
// review). Done: the drawer closes and the batch's result line says so. Refused: the drawer
// stays and shows the failure (`refusal`, the drawer's matchRefusal). The delete is
// optimistic, so while it is sent the section shows the categorization as the undo sent it
// (the run's `addedShown`). An added transaction also has the match the server wrote, so
// the page draws this section in Matched to's place whenever `isShown`.
export function useBankAdded({ drawer, canWrite, batch, connectionAccountId }: BankAddedInput) {
    const { detail } = drawer
    const txnId = detail?.status === 'reviewed' ? detail.id : null
    const { query, sources } = useAddedQuery(txnId)
    const writes = useServerActionState()
    const isAdding = useBankingUIStore(s => s.isAdding)
    const refusal = useBankingUIStore(s => s.matchRefusal)
    const setMatchRefusal = useBankingUIStore(s => s.setMatchRefusal)
    const isUndoing = isUndoSending(batch.pending, txnId)
    const input = { bankAmount: detail?.amount ?? 0, connectionAccountId }
    const row = txnId !== null && query.isReady ? query.data : undefined
    const live = row ? addedShownOf(row, input) : undefined
    const held = isUndoing ? batch.pending?.addedShown : undefined
    const shown = live ?? held
    const view: AddedView =
        txnId === null
            ? 'none'
            : addedViewOf({
                  isReady: query.isReady || isUndoing,
                  isError: query.isError,
                  row: shown,
              })
    const undo = writeControlState({
        isPending: batch.isPending || isAdding,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })
    // The undo's result line names the entry, so Undo waits for the entry to arrive.
    const undoText = shown?.undoText ?? ''
    const isUndoDisabled = undo.isDisabled || undoText === ''

    // The drawer may show another transaction (or be closed) when the run ends; the
    // outcome then touches nothing here, and the batch's result line shows a failure.
    const settle = (id: string, outcome: BatchOutcome) => {
        if (useBankingUIStore.getState().openTxnId !== id) return
        if (outcome.done.includes(id)) {
            drawer.onClose()
            return
        }
        const failure = outcome.failed.find(f => f.id === id)
        if (!failure) return
        setMatchRefusal(batchResultText('uncategorize', { done: [], failed: [failure] }).text)
    }
    const onUndo = () => {
        if (!txnId || !shown || !canWrite || isUndoDisabled) return
        setMatchRefusal(null)
        void batch
            .run({
                kind: 'uncategorize',
                ids: [txnId],
                summary: undoText,
                origin: 'drawer',
                categorizationIds: { [txnId]: shown.categorizationId },
                addedShown: shown,
            })
            .then(outcome => settle(txnId, outcome))
            .catch(err => log.error('books.banking', err))
    }
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([{ queries: [query.collection], sources }]),
            onError: err => log.error('books.banking', err),
        })
    }
    return {
        view,
        isShown: view !== 'none',
        shown,
        canWrite,
        undo: { isDisabled: isUndoDisabled, hint: undo.hint },
        isUndoing,
        onUndo,
        refusal,
        onRetry,
    }
}

export type BankAddedModel = ReturnType<typeof useBankAdded>
