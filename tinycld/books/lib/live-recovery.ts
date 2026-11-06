import type { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// What a failed read hands to one `recoverLiveQueries` call: its failed queries and the
// sources they read. Both are empty while nothing failed.
export type LiveRecovery = Pick<Parameters<typeof recoverLiveQueries>[0], 'queries' | 'sources'>

// One recovery for every failed read of a screen: a source two failed queries share is
// cleaned once, before any of the queries loads again.
export function mergeRecoveries(parts: readonly LiveRecovery[]): LiveRecovery {
    const queries = parts.flatMap(part => part.queries)
    const sources = [...new Set(parts.flatMap(part => part.sources ?? []))]
    return { queries, sources }
}
