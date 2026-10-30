import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// Rebuilds only the failed list query. The collection stays out of `sources`: the open
// record and other readers use it too, and a cleaned source empties them.
export function retryListQuery(
    query: Parameters<typeof recoverLiveQueries>[0]['queries'][number],
    logContext: string
): void {
    void recoverLiveQueries({
        queries: [query],
        sources: [],
        onError: err => log.error(logContext, err),
    })
}
