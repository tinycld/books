import { and, eq } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import {
    type ReviewViewState,
    reviewEmptyText,
    reviewViewState,
    TXN_STATUS_OF,
    type TxnTab,
} from '../lib/bank-review'
import { ID_ORDER, LIST_PAGE_SIZE } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useBooksAccess } from './useBooksAccess'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_MORE_PAGES = () => {}
// Dates are ISO days, so a lexical order is a date order; TanStack DB builds a page cursor
// only for a lexical order (lib/list-search.ts).
const NEWEST_FIRST = { direction: 'desc', stringSort: 'lexical' } as const

// For review: every for-review row of the connection, newest first, then in file order
// inside a day. Not paged: the connections query already holds these rows for the counts.
function useReviewQueueQuery(connectionId: string) {
    const [txns] = useStore('books_bank_transactions')
    return useLiveQuery({
        query: q =>
            q
                .from({ txn: txns })
                .where(({ txn }) =>
                    and(eq(txn.connection, connectionId), eq(txn.status, 'for_review'))
                )
                .orderBy(({ txn }) => txn.date, NEWEST_FIRST)
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
        queryKey: ['books.review.queue', connectionId],
    })
}

export type ReviewRowData = NonNullable<ReturnType<typeof useReviewQueueQuery>['data']>[number]

// What one transaction tab read hands to `useReviewTab`. `collection` is the live query's
// own collection, for the Retry.
export type ReviewRead = {
    rows: ReviewRowData[]
    isReady: boolean
    isError: boolean
    collection: LiveRecovery['queries'][number]
    onNearEnd: () => void
}

export function useReviewQueueRows(connectionId: string): ReviewRead {
    const query = useReviewQueueQuery(connectionId)
    return {
        rows: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        collection: query.collection,
        onNearEnd: NO_MORE_PAGES,
    }
}

// Reviewed and Excluded grow without bound, so they load a page at a time: newest first,
// then id. A separate hook from the For review read because `useLiveInfiniteQuery` cannot
// be disabled; each is called by its own tab body.
export function useReviewPagedRows(tab: 'reviewed' | 'excluded', connectionId: string): ReviewRead {
    const [txns] = useStore('books_bank_transactions')
    const status = TXN_STATUS_OF[tab]
    const query = useLiveInfiniteQuery(
        q =>
            q
                .from({ txn: txns })
                .where(({ txn }) => and(eq(txn.connection, connectionId), eq(txn.status, status)))
                .orderBy(({ txn }) => txn.date, NEWEST_FIRST)
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
        { queryKey: [`books.review.${tab}`, connectionId], pageSize: LIST_PAGE_SIZE }
    )
    // The table and the cards call this on every scroll event near the end; only one page
    // is asked for at a time.
    const onNearEnd = () => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    }
    return {
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
    accountLabel: string
    waitingCount: number
    currency: string
    read: ReviewRead
    // The page's own failed reads (connections, files, settings, access), recovered by the
    // same Retry press.
    pageRecovery: LiveRecovery
}

export type ReviewTabModel = {
    rows: ReviewRowData[]
    viewState: ReviewViewState
    emptyText: string
    recovery: LiveRecovery
    onRetry: () => void
    onNearEnd: () => void
    isWide: boolean
    canWrite: boolean
}

// The shared model of a transaction tab body, over the read of its tab.
export function useReviewTab(input: ReviewTabInput): ReviewTabModel {
    const { tab, waitingCount, read, pageRecovery } = input
    const [txns] = useStore('books_bank_transactions')
    const { canWrite } = useBooksAccess()
    const isWide = useBreakpoint() !== 'mobile'
    const recovery: LiveRecovery = read.isError
        ? { queries: [read.collection], sources: [txns] }
        : NO_RECOVERY
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([recovery, pageRecovery]),
            onError: err => log.error('books.banking', err),
        })
    }
    return {
        rows: read.rows,
        viewState: reviewViewState({
            isReady: read.isReady,
            isError: read.isError,
            rowCount: read.rows.length,
            hasFilter: false,
        }),
        emptyText: reviewEmptyText(tab, waitingCount),
        recovery,
        onRetry,
        onNearEnd: read.onNearEnd,
        isWide,
        canWrite,
    }
}
