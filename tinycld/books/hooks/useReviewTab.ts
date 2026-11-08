import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useRef } from 'react'
import type { SelectBoxState } from '../lib/bank-import-view'
import {
    type BatchKind,
    type BatchOutcome,
    canChoose,
    type DateOrder,
    hasReviewFilter,
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

export type ReviewRowData = NonNullable<ReturnType<typeof useReviewQueueQuery>['data']>[number]

// What one transaction tab read hands to `useReviewTab`. `collection` is the live query's
// own collection, for the Retry; `key` names the query, so kept rows know what they answer.
export type ReviewRead = {
    key: string
    rows: ReviewRowData[]
    isReady: boolean
    isError: boolean
    collection: LiveRecovery['queries'][number]
    onNearEnd: () => void
}

export function useReviewQueueRows(connectionId: string, input: ReviewQueryInput): ReviewRead {
    const query = useReviewQueueQuery(connectionId, input)
    return {
        key: queueKey(connectionId, input).join('|'),
        rows: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        collection: query.collection,
        onNearEnd: NO_MORE_PAGES,
    }
}

// Reviewed and Excluded grow without bound, so they load a page at a time: by date in the
// chosen direction, then id. A separate hook from the For review read because
// `useLiveInfiniteQuery` cannot be disabled; each is called by its own tab body.
export function useReviewPagedRows(
    tab: 'reviewed' | 'excluded',
    connectionId: string,
    input: ReviewQueryInput
): ReviewRead {
    const [txns] = useStore('books_bank_transactions')
    const queryKey = [`books.review.${tab}`, connectionId, ...input.keyParts]
    const query = useLiveInfiniteQuery(
        q =>
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
        { queryKey, pageSize: LIST_PAGE_SIZE }
    )
    // The table and the cards call this on every scroll event near the end; only one page
    // is asked for at a time.
    const onNearEnd = () => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    }
    return {
        key: queryKey.join('|'),
        rows: query.data,
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
}

export type ReviewTabModel = {
    rows: readonly ReviewRowData[]
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
    // The selection bar's own run is in flight: its button is busy and the bar stays up.
    isBatchRunning: boolean
    isBatchDisabled: boolean
    batchHint: string | undefined
}

type BarAction = {
    kind: BatchKind
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
    const { tab, waitingCount, currency, read, queryInput, pageRecovery, batch } = input
    const [txns] = useStore('books_bank_transactions')
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
    const kept = useRef<SettledRows<ReviewRowData>>(undefined)
    // The state describes the query's result, so it reads the filters the query ran with,
    // not the text still being typed.
    const now: SettledRows<ReviewRowData> = {
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
        ? { queries: [read.collection], sources: [txns] }
        : NO_RECOVERY
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([recovery, pageRecovery]),
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
    const keepRefused = (outcome: BatchOutcome) => {
        const current = useBankingUIStore.getState().chosen
        setChosen(outcome.failed.map(failure => failure.id).filter(id => current.has(id)))
    }
    const onBatch = () => {
        if (!batchAction || control.isDisabled || chosenIds.length === 0) return
        void batch
            .run({ kind: batchAction.kind, ids: chosenIds, summary: summary.text, origin: 'bar' })
            .then(keepRefused)
            .catch(err => log.error('books.banking', err))
    }
    return {
        rows: shown.rows,
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
        isBatchDisabled: control.isDisabled,
        batchHint: control.hint,
    }
}
