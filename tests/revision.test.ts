import { BatchMutationError } from 'pbtsdb'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { chunkOps, isRevisionConflict, MAX_LINE_OPS } from '../tinycld/books/lib/revision'

describe('isRevisionConflict', () => {
    it('is true for a single request refused with 409', () => {
        const error = new ClientResponseError({ status: 409, response: { message: 'changed' } })
        expect(isRevisionConflict(error)).toBe(true)
    })

    it('is true for a batch whose failed operation was refused with 409', () => {
        const error = new BatchMutationError({
            index: 2,
            collection: 'books_journal_entries',
            recordId: 'e1',
            response: { status: 409, message: 'changed', data: {} },
            cause: new ClientResponseError({ status: 400 }),
        })
        expect(isRevisionConflict(error)).toBe(true)
    })

    it('is false for any other refusal, and for a thing that is not an error', () => {
        expect(isRevisionConflict(new ClientResponseError({ status: 400 }))).toBe(false)
        expect(isRevisionConflict(new Error('offline'))).toBe(false)
        expect(isRevisionConflict(null)).toBe(false)
    })
})

describe('chunkOps', () => {
    it('keeps a save that fits in one batch', () => {
        expect(chunkOps([1, 2, 3])).toEqual([[1, 2, 3]])
    })

    it('returns one empty batch for no operations, so the entry update still goes out', () => {
        expect(chunkOps([])).toEqual([[]])
    })

    it('splits at the batch limit and keeps the order', () => {
        const ops = Array.from({ length: MAX_LINE_OPS * 2 + 5 }, (_, i) => i)
        const chunks = chunkOps(ops)
        expect(chunks.map(c => c.length)).toEqual([MAX_LINE_OPS, MAX_LINE_OPS, 5])
        expect(chunks.flat()).toEqual(ops)
    })
})
