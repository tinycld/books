import { eq } from '@tanstack/db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { accessFromRow } from '../lib/access'

// The caller's Books level, from the same books_access view the server rules
// read. Shared because every Books screen gates its writes on it.
export function useBooksAccess() {
    const [accessCollection] = useStore('books_access')
    // An explicit key (useMyLiveQuery adds the user id), so the query's identity is not
    // rebuilt from its IR on every render of every Books screen.
    const { data, isReady, isError, collection } = useMyLiveQuery(
        (query, { userId }) =>
            query.from({ access: accessCollection }).where(({ access }) => eq(access.user, userId)),
        { queryKey: ['books.access'] }
    )
    // books_access is safe as a source since tinycld #379: core cleans only a source in
    // the error state, so the ready source every Books screen reads is never emptied.
    const retry = () => {
        void recoverLiveQueries({
            queries: [collection],
            sources: [accessCollection],
            onError: err => log.error('books.access', err),
        })
    }
    // isError, collection and retry let a screen show an error state and retry the
    // read, instead of waiting forever on an isReady that never turns true.
    return { ...accessFromRow(data?.[0], isReady), isError, collection, retry }
}
