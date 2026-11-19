import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { materialize } from 'pbtsdb'
import {
    entryLabel,
    lineAmount,
    MATCH_TRANSPORT_TEXT,
    matchEmptyText,
    matchSendingFor,
    matchSubmitState,
    matchTotals,
} from '../lib/bank-match'
import type { BatchOutcome } from '../lib/bank-review'
import { entryHref } from '../lib/entry-route'
import { linePartyName } from '../lib/line-party-options'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { formatDay } from '../lib/register-range'
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { ReviewBatch } from './useReviewBatch'
import type { ReviewDrawerModel } from './useReviewDrawer'

// The suggestions of one bank transaction, each with its journal line, the line's entry
// and the customer or vendor names of the entry's lines, in one query over the view
// books_bank_match_suggestions. Disabled while no For review transaction is open.
function useMatchOptionsQuery(txnId: string | null) {
    const [suggestions, lines, entries, customers, vendors] = useStore(
        'books_bank_match_suggestions',
        'books_journal_lines',
        'books_journal_entries',
        'books_customers',
        'books_vendors'
    )
    const query = useLiveQuery({
        query: q => {
            if (!txnId) return null
            return q
                .from({ s: suggestions })
                .where(({ s }) => eq(s.bank_transaction, txnId))
                .select(({ s }) => ({
                    id: s.id,
                    lineId: s.line,
                    date: s.date,
                    daysApart: s.days_apart,
                    line: materialize(
                        q
                            .from({ l: lines })
                            .where(({ l }) => eq(l.id, s.line))
                            .select(({ l }) => ({ debit: l.debit, credit: l.credit }))
                            .findOne()
                    ),
                    entry: materialize(
                        q
                            .from({ e: entries })
                            .where(({ e }) => eq(e.id, s.entry))
                            .select(({ e }) => ({
                                id: e.id,
                                number: e.number,
                                doc_type: e.doc_type,
                                origin: e.origin,
                                date: e.date,
                                document: e.document,
                                status: e.status,
                            }))
                            .findOne()
                    ),
                    parties: materialize(
                        q
                            .from({ l: lines })
                            .where(({ l }) => eq(l.entry, s.entry))
                            .select(({ l }) => ({
                                id: l.id,
                                position: l.position,
                                customerRow: materialize(
                                    q
                                        .from({ c: customers })
                                        .where(({ c }) => eq(c.id, l.customer))
                                        .select(({ c }) => ({ display_name: c.display_name }))
                                        .findOne()
                                ),
                                vendorRow: materialize(
                                    q
                                        .from({ v: vendors })
                                        .where(({ v }) => eq(v.id, l.vendor))
                                        .select(({ v }) => ({ display_name: v.display_name }))
                                        .findOne()
                                ),
                            }))
                    ),
                }))
        },
        queryKey: ['books.match.options', txnId],
    })
    return { query, sources: [suggestions, lines, entries, customers, vendors] }
}

type OptionRow = NonNullable<ReturnType<typeof useMatchOptionsQuery>['query']['data']>[number]

// The name of the entry's customer or vendor: the matched line's own first, else the
// first line (by position) that names one; '' when none does.
function entryPartyName(row: OptionRow): string {
    const parties = row.parties ?? []
    const own = parties.find(party => party.id === row.lineId)
    const ownName = own ? linePartyName(own) : ''
    if (ownName) return ownName
    const named = [...parties]
        .sort((a, b) => a.position - b.position)
        .map(party => linePartyName(party))
        .find(name => name !== '')
    return named ?? ''
}

function compareNumbers(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true })
}

// One suggestion as the drawer's row shows it. A row whose line or entry has not arrived
// is left out until it does (materialize keeps the suggestion row; useMailboxes drops a
// parent the same way).
function toOptions(rows: readonly OptionRow[]) {
    return rows
        .flatMap(row => {
            const { line, entry } = row
            if (!line || !entry) return []
            return [
                {
                    lineId: row.lineId,
                    label: entryLabel(entry),
                    href: entryHref(entry),
                    dateText: formatDay(row.date),
                    name: entryPartyName(row),
                    amount: lineAmount(line),
                    debit: line.debit,
                    credit: line.credit,
                    daysApart: row.daysApart,
                    number: entry.number,
                },
            ]
        })
        .sort((a, b) => a.daysApart - b.daysApart || compareNumbers(a.number, b.number))
}

export type MatchOption = ReturnType<typeof toOptions>[number]

const NO_OPTIONS: readonly OptionRow[] = []

type BankMatchInput = {
    drawer: ReviewDrawerModel
    canWrite: boolean
    batch: ReviewBatch
    currency: string
    // The list's row marks read the same view; a failed read of it is recovered by the
    // section's Retry too, so the marks come back with the options.
    suggestionsRecovery: LiveRecovery
}

// The drawer's Match section: the suggestions of the open For review transaction, the
// choice, the totals and the match itself, run through the page's one batch. Hidden for
// an Excluded transaction and for a Reviewed one.
export function useBankMatch({
    drawer,
    canWrite,
    batch,
    currency,
    suggestionsRecovery,
}: BankMatchInput) {
    const { detail } = drawer
    const txnId = detail?.status === 'for_review' ? detail.id : null
    const { query, sources } = useMatchOptionsQuery(txnId)
    const writes = useServerActionState()
    const storedChosen = useBankingUIStore(s => s.matchChosen)
    const seededFor = useBankingUIStore(s => s.matchSeededFor)
    const takeMatchChoice = useBankingUIStore(s => s.takeMatchChoice)
    const refusal = useBankingUIStore(s => s.matchRefusal)
    const setMatchRefusal = useBankingUIStore(s => s.setMatchRefusal)
    const mode = useBankingUIStore(s => s.matchMode)
    const setMatchMode = useBankingUIStore(s => s.setMatchMode)

    const isActive = txnId !== null
    const isError = isActive && query.isError
    const isLoading = isActive && !query.isReady && !isError
    const options = toOptions(isActive && query.isReady ? (query.data ?? NO_OPTIONS) : NO_OPTIONS)

    // One suggestion starts chosen; several start with none. Until the user changes the
    // choice of this transaction, it is derived here from the options as they stand; the
    // first change stores it (takeMatchChoice), so an uncheck stays.
    const [onlyOption] = options
    const isSeeded = seededFor === txnId
    const startChoice = options.length === 1 && onlyOption ? [onlyOption.lineId] : []
    const choice = new Set(isSeeded ? storedChosen : startChoice)
    // Only the lines the section lists count: a suggestion that left the view (another
    // bank transaction took it) is no longer chosen.
    const chosenOptions = options.filter(option => choice.has(option.lineId))
    const chosenIds = chosenOptions.map(option => option.lineId)

    const totals = matchTotals(detail?.amount ?? 0, chosenOptions)
    // Only the drawer of the transaction being matched shows Match as sending; another
    // transaction's boxes stay disabled through batch.isPending.
    const isSending = txnId !== null && matchSendingFor(batch.pending, txnId)
    const submit = matchSubmitState({
        chosenCount: chosenIds.length,
        difference: totals.difference,
        target: totals.target,
        currency,
        isPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })

    // A new choice drops the refusal of the last one: the server's message was about it.
    const onToggle = (lineId: string) => {
        if (!txnId || !canWrite || batch.isPending) return
        const next = choice.has(lineId)
            ? chosenIds.filter(id => id !== lineId)
            : [...chosenIds, lineId]
        takeMatchChoice(txnId, next)
        setMatchRefusal(null)
    }

    // The server moves a matched transaction to Reviewed, so the row leaves the tab and the
    // drawer closes. A failure keeps the drawer open with its text under the totals: the
    // server's message, or the transport text (the batch has logged it). The drawer may
    // show another transaction (or be closed) by the time the run ends; the outcome then
    // touches nothing here, and the batch's result line shows a failure (useReviewBatch).
    const settle = (id: string, outcome: BatchOutcome) => {
        if (useBankingUIStore.getState().openTxnId !== id) return
        if (outcome.done.includes(id)) {
            drawer.onClose()
            return
        }
        const failure = outcome.failed.find(f => f.id === id)
        if (!failure) return
        setMatchRefusal(failure.isTransport ? MATCH_TRANSPORT_TEXT : failure.message)
    }
    const onMatch = () => {
        if (!txnId || !canWrite || submit.isDisabled) return
        setMatchRefusal(null)
        void batch
            .run({
                kind: 'match',
                ids: [txnId],
                summary: '',
                origin: 'drawer',
                matchLines: { [txnId]: chosenIds },
            })
            .then(outcome => settle(txnId, outcome))
            .catch(err => log.error('books.banking', err))
    }

    const onRetry = () => {
        if (!query.collection) return
        void recoverLiveQueries({
            ...mergeRecoveries([{ queries: [query.collection], sources }, suggestionsRecovery]),
            onError: err => log.error('books.banking', err),
        })
    }

    const kind: 'hidden' | 'match' | 'matched' = isActive ? 'match' : 'hidden'
    return {
        kind,
        canWrite,
        options,
        chosenIds,
        onToggle,
        totals,
        submit,
        onMatch,
        isSending,
        // The boxes take no change while any batch run is in flight.
        isChoiceDisabled: batch.isPending,
        refusal,
        emptyText: detail ? matchEmptyText(detail.amount, detail.date, currency) : '',
        isLoading,
        isError,
        onRetry,
        mode,
        // A reader has no find mode (no button, no key F).
        onFind: () => {
            if (canWrite) setMatchMode('find')
        },
        onBack: () => setMatchMode('suggestions'),
    }
}

export type BankMatchModel = ReturnType<typeof useBankMatch>
