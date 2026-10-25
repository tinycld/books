import { describe, expect, it } from 'vitest'
import { entriesFilterKey, keepRows } from '../tinycld/books/lib/entries-query'

const base = { status: 'all' as const, search: '', rangeStart: undefined, rangeEnd: undefined }

describe('entriesFilterKey', () => {
    it('gives the same key for the same inputs', () => {
        const input = {
            ...base,
            status: 'posted' as const,
            search: 'rent',
            rangeStart: '2026-01-01',
        }
        expect(entriesFilterKey({ ...input })).toBe(entriesFilterKey({ ...input }))
    })

    it('gives distinct keys for each differing field', () => {
        const keys = [
            entriesFilterKey(base),
            entriesFilterKey({ ...base, status: 'draft' }),
            entriesFilterKey({ ...base, search: 'rent' }),
            entriesFilterKey({ ...base, rangeStart: '2026-01-01' }),
            entriesFilterKey({ ...base, rangeEnd: '2026-01-01' }),
            entriesFilterKey({ ...base, rangeStart: '2026-01-01', rangeEnd: '2026-02-01' }),
        ]
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('does not let a search containing a delimiter collide with another input', () => {
        const a = entriesFilterKey({ ...base, search: 'a|2026-01-01' })
        const b = entriesFilterKey({ ...base, search: 'a', rangeStart: '2026-01-01' })
        expect(a).not.toBe(b)
    })

    it('does not let a search fake a status or range end', () => {
        expect(entriesFilterKey({ ...base, search: 'x|y' })).not.toBe(
            entriesFilterKey({ ...base, search: 'x', rangeEnd: 'y' })
        )
        expect(entriesFilterKey({ ...base, status: 'draft', search: '' })).not.toBe(
            entriesFilterKey({ ...base, search: 'draft' })
        )
    })

    it('treats undefined bounds the same wherever they are omitted', () => {
        const withKeys = entriesFilterKey({
            status: 'all',
            search: 'q',
            rangeStart: undefined,
            rangeEnd: undefined,
        })
        const omitted = entriesFilterKey({ status: 'all', search: 'q' } as Parameters<
            typeof entriesFilterKey
        >[0])
        expect(withKeys).toBe(omitted)
    })
})

describe('keepRows', () => {
    it('uses the ready rows and records them when ready', () => {
        const result = keepRows(undefined, { isReady: true, key: 'A', rows: [1, 2] })
        expect(result).toEqual({ next: { key: 'A', rows: [1, 2] }, rows: [1, 2], keepsRows: false })
    })

    it('records an empty list when ready with no rows', () => {
        const result = keepRows(
            { key: 'A', rows: [1] },
            { isReady: true, key: 'A', rows: undefined }
        )
        expect(result.next).toEqual({ key: 'A', rows: [] })
        expect(result.rows).toBeUndefined()
        expect(result.keepsRows).toBe(false)
    })

    it('keeps the old page when not ready under the same key', () => {
        const prev = { key: 'A', rows: [1, 2] }
        const result = keepRows(prev, { isReady: false, key: 'A', rows: undefined })
        expect(result.rows).toEqual([1, 2])
        expect(result.keepsRows).toBe(true)
        expect(result.next).toBe(prev)
    })

    it('drops the old rows when not ready under a different key', () => {
        const prev = { key: 'A', rows: [1, 2] }
        const result = keepRows(prev, { isReady: false, key: 'B', rows: undefined })
        expect(result.rows).toBeUndefined()
        expect(result.keepsRows).toBe(false)
        expect(result.next).toBeUndefined()
    })

    it('returns the current rows, not the old ones, when the key differs', () => {
        const result = keepRows({ key: 'A', rows: [1, 2] }, { isReady: false, key: 'B', rows: [9] })
        expect(result.rows).toEqual([9])
        expect(result.keepsRows).toBe(false)
    })

    it('returns the current rows when not ready with no previous', () => {
        const result = keepRows(undefined, { isReady: false, key: 'A', rows: [5] })
        expect(result).toEqual({ next: undefined, rows: [5], keepsRows: false })
    })

    it('never returns stale rows of another key across a sequence', () => {
        const s1 = keepRows<number>(undefined, { isReady: true, key: 'A', rows: [1, 2] })
        const s2 = keepRows(s1.next, { isReady: false, key: 'A', rows: undefined })
        expect(s2.rows).toEqual([1, 2])
        expect(s2.keepsRows).toBe(true)
        const s3 = keepRows(s2.next, { isReady: true, key: 'B', rows: [3] })
        expect(s3.rows).toEqual([3])
        const s4 = keepRows(s3.next, { isReady: false, key: 'A', rows: undefined })
        expect(s4.rows).toBeUndefined()
        expect(s4.rows).not.toEqual([3])
        expect(s4.keepsRows).toBe(false)
    })

    it('drops kept rows when the key changes while not ready, even if it later returns', () => {
        const a = keepRows<number>(undefined, { isReady: true, key: 'A', rows: [1, 2] })
        const b = keepRows(a.next, { isReady: false, key: 'B', rows: undefined })
        expect(b.rows).toBeUndefined()
        const backToA = keepRows(b.next, { isReady: false, key: 'A', rows: undefined })
        expect(backToA.rows).toBeUndefined()
        expect(backToA.keepsRows).toBe(false)
    })

    it('does not keep larger old rows when only the limit shrinks while not ready', () => {
        const ready = keepRows<number>(undefined, {
            isReady: true,
            key: 'A',
            rows: [1, 2, 3, 4],
            limit: 4,
        })
        const shrunk = keepRows(ready.next, {
            isReady: false,
            key: 'A',
            rows: undefined,
            limit: 2,
        })
        expect(shrunk.rows).toBeUndefined()
        expect(shrunk.keepsRows).toBe(false)
    })

    it('keeps the old rows when the limit grows while not ready', () => {
        const ready = keepRows<number>(undefined, {
            isReady: true,
            key: 'A',
            rows: [1, 2],
            limit: 2,
        })
        const grown = keepRows(ready.next, {
            isReady: false,
            key: 'A',
            rows: undefined,
            limit: 4,
        })
        expect(grown.rows).toEqual([1, 2])
        expect(grown.keepsRows).toBe(true)
    })

    it('converges when ready rows arrive as a new array with equal content each call', () => {
        const first = keepRows<number>(undefined, { isReady: true, key: 'A', rows: [1, 2] })
        const second = keepRows(first.next, { isReady: true, key: 'A', rows: [1, 2] })
        const third = keepRows(second.next, { isReady: true, key: 'A', rows: [1, 2] })
        expect(second.next).toEqual(first.next)
        expect(third.next).toBe(second.next)
    })

    it('returns a stable kept value across repeated not-ready calls', () => {
        const ready = keepRows<number>(undefined, { isReady: true, key: 'A', rows: [1, 2] })
        const one = keepRows(ready.next, { isReady: false, key: 'A', rows: [7] })
        const two = keepRows(one.next, { isReady: false, key: 'A', rows: [8] })
        expect(one.next).toBe(ready.next)
        expect(two.next).toBe(one.next)
        expect(two.rows).toBe(one.rows)
    })
})
