import { describe, expect, it } from 'vitest'
import { keepReversals } from '../tinycld/books/lib/reversal-rows'

const posted = { reverses: 'e1', status: 'posted' }
const voided = { reverses: 'e2', status: 'void' }

describe('keepReversals', () => {
    it('knows every entry of a query that has answered', () => {
        const now = keepReversals(undefined, {
            isReady: true,
            entryIds: ['e1', 'e2', 'e3'],
            rows: [posted, voided],
        })
        expect(now.rows).toEqual([posted, voided])
        expect(now.isKnown('e3')).toBe(true)
        expect(now.next?.ids.has('e2')).toBe(true)
    })

    it('knows nothing before the first answer', () => {
        const now = keepReversals(undefined, { isReady: false, entryIds: ['e1'], rows: undefined })
        expect(now.rows).toEqual([])
        expect(now.isKnown('e1')).toBe(false)
        expect(now.next).toBeUndefined()
    })

    // The list loaded more rows: the query for the longer id list has not answered yet.
    it('keeps the answered rows for the entries it asked about while a longer query loads', () => {
        const first = keepReversals(undefined, {
            isReady: true,
            entryIds: ['e1', 'e2'],
            rows: [posted, voided],
        })
        const loading = keepReversals(first.next, {
            isReady: false,
            entryIds: ['e1', 'e2', 'e9'],
            rows: undefined,
        })
        expect(loading.rows).toEqual([posted, voided])
        expect(loading.isKnown('e1')).toBe(true)
        expect(loading.isKnown('e9')).toBe(false)
        expect(loading.next).toBe(first.next)
    })

    it('returns the same kept value when an answer has the same content', () => {
        const first = keepReversals(undefined, { isReady: true, entryIds: ['e1'], rows: [posted] })
        const again = keepReversals(first.next, {
            isReady: true,
            entryIds: ['e1'],
            rows: [{ ...posted }],
        })
        expect(again.next).toBe(first.next)
        const changed = keepReversals(first.next, {
            isReady: true,
            entryIds: ['e1'],
            rows: [{ reverses: 'e1', status: 'void' }],
        })
        expect(changed.next).not.toBe(first.next)
    })
})
