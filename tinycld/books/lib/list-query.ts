import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// Rebuilds a list's failed queries (a disabled one is undefined and skipped). The
// collection stays out of `sources`: the open record and other readers use it too, and a
// cleaned source empties them.
export function retryListQuery(
    queries: Parameters<typeof recoverLiveQueries>[0]['queries'],
    logContext: string
): void {
    void recoverLiveQueries({
        queries,
        sources: [],
        onError: err => log.error(logContext, err),
    })
}
