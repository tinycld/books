import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { declineNoteOf } from '../lib/estimate-decline-note'
import type { BooksEstimates } from '../types'

// The customer's decline note of one estimate: its newest response, live (a response that
// arrives while the estimate is open shows through the collection's realtime), against
// the estimate's saved status. While the query loads there is no note.
export function useEstimateDeclineNote(
    estimateId: string,
    status: BooksEstimates['status'] | undefined
) {
    const [responsesCollection] = useStore('books_estimate_responses')
    const query = useLiveQuery({
        query: q =>
            estimateId
                ? q
                      .from({ response: responsesCollection })
                      .where(({ response }) => eq(response.estimate, estimateId))
                      .orderBy(({ response }) => response.created, 'desc')
                      .findOne()
                : null,
        queryKey: ['books.estimate.response', estimateId],
    })

    // A failed live query stays failed on a reload of its collection; restart it. The
    // collection is cleaned only when it failed itself.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [responsesCollection],
            onError: err => log.error('books.estimate.response', err),
        })
    }

    return {
        note: declineNoteOf(status, query.data),
        loadFailed: query.isError,
        retry,
    }
}
