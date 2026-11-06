import { describe, expect, it } from 'vitest'
import { type LiveRecovery, mergeRecoveries } from '../tinycld/books/lib/live-recovery'

function liveQuery() {
    return { cleanup: async () => {}, preload: async () => {} }
}

function source(status: string) {
    return { status, cleanup: async () => {} }
}

describe('mergeRecoveries', () => {
    it('merges no parts into empty queries and sources', () => {
        expect(mergeRecoveries([])).toEqual({ queries: [], sources: [] })
    })

    it('keeps every query and source of both parts, in order', () => {
        const [q1, q2, q3] = [liveQuery(), liveQuery(), liveQuery()]
        const [s1, s2, s3] = [source('error'), source('ready'), source('error')]
        const first: LiveRecovery = { queries: [q1, q2], sources: [s1] }
        const second: LiveRecovery = { queries: [q3], sources: [s2, s3] }

        const merged = mergeRecoveries([first, second])

        expect(merged.queries).toStrictEqual([q1, q2, q3])
        expect(merged.sources).toStrictEqual([s1, s2, s3])
        expect(merged.queries[0]).toBe(q1)
        expect(merged.queries[2]).toBe(q3)
        expect(merged.sources?.[0]).toBe(s1)
        expect(merged.sources?.[2]).toBe(s3)
    })

    it('lists a source that both parts pass once', () => {
        const [q1, q2] = [liveQuery(), liveQuery()]
        const shared = source('error')
        const own = source('ready')

        const merged = mergeRecoveries([
            { queries: [q1], sources: [shared] },
            { queries: [q2], sources: [own, shared] },
        ])

        expect(merged.sources).toStrictEqual([shared, own])
        expect(merged.sources?.filter(s => s === shared)).toHaveLength(1)
    })

    it('treats a part without sources as one with none', () => {
        const q1 = liveQuery()
        const s1 = source('error')

        const merged = mergeRecoveries([{ queries: [q1] }, { queries: [], sources: [s1] }])

        expect(merged).toEqual({ queries: [q1], sources: [s1] })
    })

    it('keeps a disabled query (undefined) for recoverLiveQueries to skip', () => {
        const q1 = liveQuery()

        const merged = mergeRecoveries([{ queries: [undefined, q1], sources: [] }])

        expect(merged.queries).toStrictEqual([undefined, q1])
    })
})
