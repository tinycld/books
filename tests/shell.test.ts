import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

describe('books shell', () => {
    it('registers no collections yet', () => {
        const newCollection = () => {
            throw new Error('no collection should be created')
        }
        expect(registerCollections(newCollection as never, {} as never)).toEqual({})
    })
})
