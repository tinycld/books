import { create } from '@tinycld/core/lib/store'
import { useEffect } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

// The failed reads of one history's values (a relation's name, a line's position), by
// the read that failed. The history shows one error with Retry for all of them, and its
// Retry recovers them with its own reads (spec §3 States, plan Do 5).
type ReadFailures = Record<string, LiveRecovery>

interface HistoryReadsState {
    failures: Record<string, ReadFailures>
    report(history: string, read: string, recovery: LiveRecovery): void
    clear(history: string, read: string): void
}

export const useHistoryReadsStore = create<HistoryReadsState>()(set => ({
    failures: {},
    report: (history, read, recovery) =>
        set(state => ({
            failures: {
                ...state.failures,
                [history]: { ...state.failures[history], [read]: recovery },
            },
        })),
    clear: (history, read) =>
        set(state => {
            const reads = state.failures[history]
            if (!reads || !(read in reads)) return state
            const { [read]: _cleared, ...rest } = reads
            return { failures: { ...state.failures, [history]: rest } }
        }),
}))

/** The key of one record's history: a screen and a panel of the same record share it. */
export function historyKey(collection: string, id: string): string {
    return `${collection}/${id}`
}

type FailedQuery = LiveRecovery['queries'][number]
type FailedSource = NonNullable<LiveRecovery['sources']>[number]

/**
 * Reports a value's read to its history while it has failed, and withdraws it when the
 * read recovers or the value leaves the screen. The store is outside React, so an effect
 * is what writes to it.
 */
export function useReportHistoryRead(
    history: string,
    read: string,
    failed: { query: FailedQuery; source: FailedSource } | null
) {
    const report = useHistoryReadsStore(state => state.report)
    const clear = useHistoryReadsStore(state => state.clear)
    const query = failed?.query
    const source = failed?.source
    useEffect(() => {
        if (!query || !source) return
        report(history, read, { queries: [query], sources: [source] })
        return () => clear(history, read)
    }, [history, read, query, source, report, clear])
}

const NO_FAILURES: ReadFailures = {}

/** The failed value reads of one history. */
export function useHistoryReadFailures(history: string): LiveRecovery[] {
    const reads = useHistoryReadsStore(state => state.failures[history] ?? NO_FAILURES)
    return Object.values(reads)
}
