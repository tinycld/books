import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { getShareToken, setShareToken } from '@tinycld/core/lib/share-token'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import {
    businessNameOf,
    type PublicEstimateRow,
    type PublicOutcome,
    publicOutcomeOf,
} from '../lib/estimate-public'
import { todayIso } from '../lib/register-range'

export type PublicEstimateView =
    | { status: 'loading' }
    | { status: 'not-found' }
    | { status: 'error'; retry: () => void }
    | {
          status: 'ready'
          row: PublicEstimateRow
          outcome: PublicOutcome
          business: string
          reload: () => Promise<void>
      }

// The customer's estimate, read through the public view with the link's token. The view
// is not pushed live to a signed-out reader: it shows a change on its next read (pbtsdb
// reloads it on foreground and network back, and `reload` after a response).
export function usePublicEstimate(token: string): PublicEstimateView {
    // A module value, not React state: the view's rule reads the header, so the first
    // request of the query below must already carry it.
    if (getShareToken() !== token) setShareToken(token)
    const [publicCollection] = useStore('books_estimate_public')
    const { org } = useOrgInfo()
    const query = useLiveQuery({
        query: q =>
            q
                .from({ row: publicCollection })
                .where(({ row }) => eq(row.token, token))
                .findOne(),
        queryKey: ['books.estimate-public', token],
    })

    // A failed live query stays failed on a reload of its collection; restart it.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [publicCollection],
            onError: err => log.error('books.estimate-public', err),
        })
    }
    const reload = () => publicCollection.reload()

    if (query.isError) return { status: 'error', retry }
    if (!query.isReady) return { status: 'loading' }
    const row = query.data
    if (row === undefined) return { status: 'not-found' }
    return {
        status: 'ready',
        row,
        outcome: publicOutcomeOf(row, todayIso()),
        business: businessNameOf(row, org?.name ?? ''),
        reload,
    }
}
