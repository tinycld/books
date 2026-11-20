import { eq, type InitialQueryBuilder } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { materialize } from 'pbtsdb'
import { useRef } from 'react'
import type { SelectBoxState } from '../lib/bank-import-view'
import { barMatchState } from '../lib/bank-match'
import {
    type BatchKind,
    type BatchOutcome,
    canChoose,
    type DateOrder,
    hasReviewFilter,
    keptAfterBatch,
    type MoveKind,
    type ReviewFilters,
    type ReviewViewState,
    type ReviewWhereInput,
    reviewEmptyText,
    reviewRange,
    reviewViewState,
    reviewWhere,
    type SettledRows,
    selectAllState,
    selectionSummary,
    settleRows,
    shownChoice,
    TXN_STATUS_OF,
    type TxnTab,
    toggleAllChoice,
    toggleChoice,
    writeControlState,
} from '../lib/bank-review'
import { ID_ORDER, LIST_PAGE_SIZE, SEARCH_DELAY_MS } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import type { MatchSuggestions, RowSuggestion } from './useMatchSuggestions'
import type { ReviewBatch } from './useReviewBatch'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_MORE_PAGES = () => {}

// What a transaction tab's read runs with: the `where` input over the applied filters, the
// date direction, and the parts of its query key after the read's name and connection.
export type ReviewQueryInput = {
    where: ReviewWhereInput
    // Dates are ISO days, so a lexical order is a date order; TanStack DB builds a page
    // cursor only for a lexical order (lib/list-search.ts).
    dateDirection: { direction: 'asc' | 'desc'; stringSort: 'lexical' }
    keyParts: string[]
    // The filters as typed and picked; `where.filters` holds the search once applied.
    filters: ReviewFilters
    dateOrder: DateOrder
}

// The toolbar's filters and the date order from the banking UI store, with the search
// applied after a pause in typing (SEARCH_DELAY_MS), so the server gets one request per
// pause.
export function useReviewQueryInput(
    tab: TxnTab,
    connectionId: string,
    currency: string
): ReviewQueryInput {
    const filters = useBankingUIStore(s => s.reviewFilters)
    const dateOrder = useBankingUIStore(s => s.dateOrder)
    const settings = useBooksSettings()
    const applied = useDebouncedValue(filters.search, SEARCH_DELAY_MS)
    const range = reviewRange(filters.preset, todayIso(), fiscalStartMonth(settings.settings))
    return {
        where: {
            connection: connectionId,
            status: TXN_STATUS_OF[tab],
            filters: { ...filters, search: applied },
            range,
            currency,
        },
        dateDirection: {
            direction: dateOrder === 'newest' ? 'desc' : 'asc',
            stringSort: 'lexical',
        },
        // The currency decides whether the search reads as an amount.
        keyParts: [
            applied,
            filters.preset,
            filters.type,
            dateOrder,
            range?.start ?? '',
            range?.end ?? '',
            currency,
        ],
        filters,
        dateOrder,
    }
}

// For review: every for-review row of the connection under the filters, by date in the
// chosen direction, then in file order inside a day. Not paged: the connections query
// already holds these rows for the counts.
function queueKey(connectionId: string, input: ReviewQueryInput) {
    return ['books.review.queue', connectionId, ...input.keyParts]
}

function useReviewQueueQuery(connectionId: string, input: ReviewQueryInput) {
    const [txns] = useStore('books_bank_transactions')
    return useLiveQuery({
        query: q =>
            q
                .from({ txn: txns })
                .where(({ txn }) =>
                    reviewWhere(
                        {
                            connection: txn.connection,
                            status: txn.status,
                            description: txn.description,
                            memo: txn.memo,
                            checkNumber: txn.check_number,
                            amount: txn.amount,
                            date: txn.date,
                        },
                        input.where
                    )
                )
                .orderBy(({ txn }) => txn.date, input.dateDirection)
                .orderBy(({ txn }) => txn.line, 'asc')
                .orderBy(({ txn }) => txn.id, ID_ORDER)
                .select(({ txn }) => ({
                    id: txn.id,
                    date: txn.date,
                    description: txn.description,
                    memo: txn.memo,
                    checkNumber: txn.check_number,
                    amount: txn.amount,
                    line: txn.line,
                    status: txn.status,
                })),
        queryKey: queueKey(connectionId, input),
    })
}

type ReviewQueryRow = NonNullable<ReturnType<typeof useReviewQueueQuery>['data']>[number]

type PagedTxns = ReturnType<typeof useStore<['books_bank_transactions']>>[0]

// The Reviewed and Excluded rows of a connection under the filters, by date in the chosen
// direction, then id; each tab's read adds its own `select`.
function pagedTxns(q: InitialQueryBuilder, txns: PagedTxns, input: ReviewQueryInput) {
    return q
        .from({ txn: txns })
        .where(({ txn }) =>
            reviewWhere(
                {
                    connection: txn.connection,
                    status: txn.status,
                    description: txn.description,
                    memo: txn.memo,
                    checkNumber: txn.check_number,
                    amount: txn.amount,
                    date: txn.date,
                },
                input.where
            )
        )
        .orderBy(({ txn }) => txn.date, input.dateDirection)
        .orderBy(({ txn }) => txn.id, ID_ORDER)
}

// Reviewed rows, each with the books_bank_match_lines rows of its match and their entries
// (the In Books column).
function useReviewedQuery(connectionId: string, input: ReviewQueryInput) {
    const [txns, matchLines, entries] = useStore(
        'books_bank_transactions',
        'books_bank_match_lines',
        'books_journal_entries'
    )
    const queryKey = ['books.review.reviewed', connectionId, ...input.keyParts]
    const query = useLiveInfiniteQuery(
        q =>
            pagedTxns(q, txns, input).select(({ txn }) => ({
                id: txn.id,
                date: txn.date,
                description: txn.description,
                memo: txn.memo,
                checkNumber: txn.check_number,
                amount: txn.amount,
                line: txn.line,
                status: txn.status,
                matchLines: materialize(
                    q
                        .from({ ml: matchLines })
                        .where(({ ml }) => eq(ml.bank_transaction, txn.id))
                        .select(({ ml }) => ({
                            id: ml.id,
                            entry: materialize(
                                q
                                    .from({ e: entries })
                                    .where(({ e }) => eq(e.id, ml.entry))
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
                        }))
                ),
            })),
        { queryKey, pageSize: LIST_PAGE_SIZE }
    )
    return { query, queryKey, sources: [txns, matchLines, entries] }
}

// Excluded rows. Only a Reviewed row has a match (the server takes a match of a For review
// transaction only, and an undo moves it back to For review), so this read has no
// match-line subquery and sends no reads for one.
function useExcludedQuery(connectionId: string, input: ReviewQueryInput) {
    const [txns] = useStore('books_bank_transactions')
    const queryKey = ['books.review.excluded', connectionId, ...input.keyParts]
    const query = useLiveInfiniteQuery(
        q =>
            pagedTxns(q, txns, input).select(({ txn }) => ({
                id: txn.id,
                date: txn.date,
                description: txn.description,
                memo: txn.memo,
                checkNumber: txn.check_number,
                amount: txn.amount,
                line: txn.line,
                status: txn.status,
            })),
        { queryKey, pageSize: LIST_PAGE_SIZE }
    )
    return { query, queryKey, sources: [txns] }
}

type ReviewedQueryRow = ReturnType<typeof useReviewedQuery>['query']['data'][number]
export type ReviewMatchLine = NonNullable<ReviewedQueryRow['matchLines']>[number]

// A row as a tab read gives it: only Reviewed rows have match lines.
type ReviewReadRow = ReviewQueryRow & { matchLines?: ReviewedQueryRow['matchLines'] }

// A listed transaction with the Books transactions suggested for it (For review only; an
// empty list on the other tabs, and while the suggestions load or after their read failed)
// and the match lines of its match (Reviewed only; empty on the other tabs).
export type ReviewRowData = ReviewQueryRow & {
    suggestions: readonly RowSuggestion[]
    matchLines: readonly ReviewMatchLine[]
}

const NO_SUGGESTIONS: readonly RowSuggestion[] = []
const NO_MARKS: ReadonlyMap<string, readonly RowSuggestion[]> = new Map()
const NO_MATCH_LINES: readonly ReviewMatchLine[] = []

// What one transaction tab read hands to `useReviewTab`. `collection` is the live query's
// own collection, for the Retry; `key` names the query, so kept rows know what they answer.
export type ReviewRead = {
    key: string
    rows: ReviewReadRow[]
    sources: LiveRecovery['sources']
    isReady: boolean
    isError: boolean
    collection: LiveRecovery['queries'][number]
    onNearEnd: () => void
}

export function useReviewQueueRows(connectionId: string, input: ReviewQueryInput): ReviewRead {
    const [txns] = useStore('books_bank_transactions')
    const query = useReviewQueueQuery(connectionId, input)
    return {
        key: queueKey(connectionId, input).join('|'),
        rows: query.data ?? [],
        sources: [txns],
        isReady: query.isReady,
        isError: query.isError,
        collection: query.collection,
        onNearEnd: NO_MORE_PAGES,
    }
}

// Reviewed and Excluded grow without bound, so they load a page at a time: by date in the
// chosen direction, then id. A separate hook from the For review read because
// `useLiveInfiniteQuery` cannot be disabled; each is called by its own tab body.
export function useReviewedRows(connectionId: string, input: ReviewQueryInput): ReviewRead {
    const paged = useReviewedQuery(connectionId, input)
    return pagedRead(paged)
}

export function useExcludedRows(connectionId: string, input: ReviewQueryInput): ReviewRead {
    const paged = useExcludedQuery(connectionId, input)
    return pagedRead(paged)
}

// The part of a paged live query that a tab read hands on.
type PagedRead = {
    query: {
        data: ReviewReadRow[]
        hasNextPage: boolean
        isFetchingNextPage: boolean
        fetchNextPage: () => unknown
        isReady: boolean
        isError: boolean
        collection: LiveRecovery['queries'][number]
    }
    queryKey: string[]
    sources: LiveRecovery['sources']
}

function pagedRead({ query, queryKey, sources }: PagedRead): ReviewRead {
    // The table and the cards call this on every scroll event near the end; only one page
    // is asked for at a time.
    const onNearEnd = () => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    }
    return {
        key: queryKey.join('|'),
        rows: query.data,
        sources,
        isReady: query.isReady,
        isError: query.isError,
        collection: query.collection,
        onNearEnd,
    }
}

type ReviewTabInput = {
    tab: TxnTab
    connectionId: string
    waitingCount: number
    currency: string
    read: ReviewRead
    queryInput: ReviewQueryInput
    // The page's own failed reads (connections, files, settings, access), recovered by the
    // same Retry press.
    pageRecovery: LiveRecovery
    // The page's one batch, shared with the drawer beside the page; the page clears its
    // result on a tab or account change.
    batch: ReviewBatch
    // The page's read of the For review row marks (useBankingScreen); disabled on the other
    // tabs.
    suggestions: MatchSuggestions
}

export type ReviewTabModel = {
    rows: readonly ReviewRowData[]
    // Reviewed shows the In Books column (REVIEWED_CELLS) and the cards' third line.
    showsInBooks: boolean
    viewState: ReviewViewState
    emptyText: string
    recovery: LiveRecovery
    onRetry: () => void
    onNearEnd: () => void
    isWide: boolean
    canWrite: boolean
    // The filters as typed and picked, for the toolbar.
    filters: ReviewFilters
    hasFilter: boolean
    // The rows on screen are not yet the answer to the filters as they stand: the typed
    // search waits for a pause, or the new query loads under the kept rows.
    isBusy: boolean
    dateOrder: DateOrder
    onToggleOrder: () => void
    onClearFilters: () => void
    openTxnId: string | null
    onOpenRow: (id: string) => void
    // The row the review keys focused, when the list shows it; its index in `rows`, or -1.
    focusedTxnId: string | null
    focusedIndex: number
    batch: ReviewBatch
    result: { text: string; tone: 'muted' | 'danger' } | null
    // Choosing rows: writers on For review and Excluded only.
    canChoose: boolean
    // The chosen ids the list shows, in list order (shownChoice).
    chosenIds: string[]
    isChosen: (id: string) => boolean
    selection: { count: number; text: string }
    selectState: SelectBoxState
    // The boxes and select-all wait while a change runs.
    isChoiceDisabled: boolean
    onToggle: (id: string) => void
    onToggleAll: () => void
    onClearChoice: () => void
    onBatch: () => void
    batchAction: BarAction | null
    // The selection bar's own run is in flight: the bar stays up, and the button of that
    // run's kind (`runningKind`) is busy.
    isBatchRunning: boolean
    runningKind: BatchKind | null
    isBatchDisabled: boolean
    batchHint: string | undefined
    // The bar's Match of the chosen rows: For review, writers only.
    matchAction: MatchBarAction | null
}

type MatchBarAction = {
    label: string
    busyLabel: string
    testID: 'bank-review-match-chosen'
    isDisabled: boolean
    hint: string | undefined
    isRunning: boolean
    onPress: () => void
}

type BarAction = {
    kind: MoveKind
    label: string
    busyLabel: string
    testID: 'bank-review-exclude' | 'bank-review-restore'
}

const BAR_ACTIONS: Record<TxnTab, BarAction | null> = {
    review: {
        kind: 'exclude',
        label: 'Exclude',
        busyLabel: 'Excluding…',
        testID: 'bank-review-exclude',
    },
    excluded: {
        kind: 'restore',
        label: 'Move to For review',
        busyLabel: 'Moving…',
        testID: 'bank-review-restore',
    },
    reviewed: null,
}

// The shared model of a transaction tab body, over the read of its tab. While the query for
// a new search, filter or order loads, the last settled rows stay on screen (settleRows),
// kept in a ref that is written during render, as useRecordList keeps its value.
export function useReviewTab(input: ReviewTabInput): ReviewTabModel {
    const { tab, waitingCount, currency, read, queryInput, pageRecovery, batch, suggestions } =
        input
    const { canWrite } = useBooksAccess()
    const writes = useServerActionState()
    const chosenSet = useBankingUIStore(s => s.chosen)
    const setChosen = useBankingUIStore(s => s.setChosen)
    const clearChosen = useBankingUIStore(s => s.clearChosen)
    const isWide = useBreakpoint() !== 'mobile'
    const openTxnId = useBankingUIStore(s => s.openTxnId)
    const openTxn = useBankingUIStore(s => s.openTxn)
    const storedFocus = useBankingUIStore(s => s.focusedTxnId)
    const toggleDateOrder = useBankingUIStore(s => s.toggleDateOrder)
    const clearReviewFilters = useBankingUIStore(s => s.clearReviewFilters)
    const kept = useRef<SettledRows<ReviewReadRow>>(undefined)
    // The state describes the query's result, so it reads the filters the query ran with,
    // not the text still being typed.
    const now: SettledRows<ReviewReadRow> = {
        key: read.key,
        rows: read.rows,
        viewState: reviewViewState({
            isReady: read.isReady,
            isError: read.isError,
            rowCount: read.rows.length,
            hasFilter: hasReviewFilter(queryInput.where.filters),
        }),
    }
    const { next, shown } = settleRows(kept.current, now)
    kept.current = next
    const recovery: LiveRecovery = read.isError
        ? { queries: [read.collection], sources: read.sources }
        : NO_RECOVERY
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([recovery, suggestions.recovery, pageRecovery]),
            onError: err => log.error('books.banking', err),
        })
    }
    const isTyping = queryInput.filters.search !== queryInput.where.filters.search
    const isLoadingUnderKeptRows = now.viewState === 'loading' && shown !== now

    // The choice is always of the rows on screen: every read and every write of it goes
    // through the shown rows, so a row that left the list left the choice.
    const isChoosable = canChoose(tab, canWrite)
    const rows = shown.rows
    const chosenIds = isChoosable ? shownChoice(rows, chosenSet) : []
    const shownSet = new Set(chosenIds)
    const summary = selectionSummary(rows, shownSet, currency)
    // As the choice, the key focus is of a row on screen: a focused row that left the list
    // focuses nothing, and the next movement key starts again at the first row.
    const focusedIndex = storedFocus === null ? -1 : rows.findIndex(row => row.id === storedFocus)
    const focusedTxnId = focusedIndex >= 0 ? storedFocus : null
    // The optimistic update takes the rows off the list at once, so while the bar's own
    // run is in flight it shows the choice as it was sent. A tab or account change clears
    // the choice, so after one the bar of that run is gone (the controls stay disabled).
    const isBarRun = batch.pending?.origin === 'bar' && chosenSet.size > 0
    const barRun = isBarRun ? batch.pending : null
    const selection = barRun
        ? { count: barRun.ids.length, text: barRun.summary }
        : { count: summary.count, text: summary.text }
    const control = writeControlState({
        isPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })
    const batchAction = isChoosable ? BAR_ACTIONS[tab] : null
    const onToggle = (id: string) => {
        if (batch.isPending) return
        setChosen(toggleChoice(rows, chosenSet, id))
    }
    const onToggleAll = () => {
        if (batch.isPending) return
        setChosen(toggleAllChoice(rows, chosenSet))
    }
    const onClearChoice = () => {
        if (batch.isPending) return
        clearChosen()
    }
    // The done rows leave the list and the choice; the refused rows come back by pbtsdb's
    // rollback and stay chosen, unless a tab or account change cleared the choice while
    // the run was in flight: only refused ids still in the store's choice stay. The run
    // returns refusals as its outcome (the result line) instead of throwing; anything else
    // it throws is a bug, so it is logged.
    // A match run also keeps the rows it skipped (keptAfterBatch), in the order of the
    // choice that was sent.
    const keepRefused = (
        outcome: BatchOutcome,
        sentChoice: readonly string[],
        skippedIds: readonly string[] = []
    ) => {
        const current = useBankingUIStore.getState().chosen
        setChosen(keptAfterBatch(outcome, skippedIds, sentChoice).filter(id => current.has(id)))
    }
    const onBatch = () => {
        if (!batchAction || control.isDisabled || chosenIds.length === 0) return
        void batch
            .run({ kind: batchAction.kind, ids: chosenIds, summary: summary.text, origin: 'bar' })
            .then(outcome => keepRefused(outcome, chosenIds))
            .catch(err => log.error('books.banking', err))
    }
    // The row marks of For review. Their read is not the list's: while it loads or after it
    // failed the rows show their memo line, and its failure joins the Retry only.
    const marks = tab === 'review' ? suggestions.byTxn : NO_MARKS
    const listedRows: ReviewRowData[] = rows.map(row => ({
        ...row,
        suggestions: marks.get(row.id) ?? NO_SUGGESTIONS,
        matchLines: row.matchLines ?? NO_MATCH_LINES,
    }))
    const plan = matchPlan(listedRows, shownSet)
    const matchState = barMatchState({
        matchableCount: plan.ids.length,
        isPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })
    const onMatch = () => {
        if (matchState.isDisabled || plan.ids.length === 0) return
        void batch
            .run({
                kind: 'match',
                ids: plan.ids,
                summary: summary.text,
                origin: 'bar',
                matchLines: plan.matchLines,
                skipped: plan.skippedIds.length,
            })
            .then(outcome => keepRefused(outcome, chosenIds, plan.skippedIds))
            .catch(err => log.error('books.banking', err))
    }
    const runningKind = barRun?.kind ?? null
    const matchAction: MatchBarAction | null =
        tab === 'review' && isChoosable
            ? {
                  label: 'Match',
                  busyLabel: 'Matching…',
                  testID: 'bank-review-match-chosen',
                  isDisabled: matchState.isDisabled,
                  hint: matchState.hint,
                  isRunning: runningKind === 'match',
                  onPress: onMatch,
              }
            : null
    return {
        rows: listedRows,
        showsInBooks: tab === 'reviewed',
        viewState: shown.viewState,
        emptyText: reviewEmptyText(tab, waitingCount),
        recovery,
        onRetry,
        onNearEnd: read.onNearEnd,
        isWide,
        canWrite,
        filters: queryInput.filters,
        hasFilter: hasReviewFilter(queryInput.filters),
        isBusy: isTyping || isLoadingUnderKeptRows,
        dateOrder: queryInput.dateOrder,
        onToggleOrder: toggleDateOrder,
        onClearFilters: clearReviewFilters,
        openTxnId,
        onOpenRow: openTxn,
        focusedTxnId,
        focusedIndex,
        batch,
        result: batch.result,
        canChoose: isChoosable,
        chosenIds,
        isChosen: id => shownSet.has(id),
        selection,
        selectState: selectAllState(rows, chosenSet),
        isChoiceDisabled: batch.isPending,
        onToggle,
        onToggleAll,
        onClearChoice,
        onBatch,
        batchAction,
        isBatchRunning: barRun !== null,
        runningKind,
        isBatchDisabled: control.isDisabled,
        batchHint: control.hint,
        matchAction,
    }
}

// What the bar's Match sends: each chosen row with exactly one suggestion, with that
// suggestion's line; the other chosen rows are skipped (they need a choice in the drawer).
// In list order.
function matchPlan(rows: readonly ReviewRowData[], chosen: ReadonlySet<string>) {
    const ids: string[] = []
    const skippedIds: string[] = []
    const matchLines: Record<string, string[]> = {}
    for (const row of rows) {
        if (!chosen.has(row.id)) continue
        const [only] = row.suggestions
        if (row.suggestions.length === 1 && only) {
            ids.push(row.id)
            matchLines[row.id] = [only.line]
        } else {
            skippedIds.push(row.id)
        }
    }
    return { ids, skippedIds, matchLines }
}
