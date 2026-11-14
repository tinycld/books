import { BatchMutationError } from 'pbtsdb'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { refusedRecordId } from '../tinycld/books/lib/batch-refusal'

describe('refusedRecordId', () => {
    it('is the record of the operation a refused batch names', () => {
        const error = new BatchMutationError({
            index: 2,
            collection: 'books_invoice_lines',
            recordId: 'line2',
            response: { status: 400, message: 'Line 2: refused', data: {} },
            cause: new ClientResponseError({ status: 400 }),
        })
        expect(refusedRecordId(error)).toBe('line2')
    })

    it('is null for a single request, and for a thing that is not an error', () => {
        expect(refusedRecordId(new ClientResponseError({ status: 400 }))).toBeNull()
        expect(refusedRecordId(new Error('offline'))).toBeNull()
        expect(refusedRecordId(null)).toBeNull()
    })
})
