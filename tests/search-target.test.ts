import { describe, expect, it } from 'vitest'
import { searchTarget } from '../tinycld/books/lib/search-target'

describe('searchTarget', () => {
    it('routes an account hit to its register', () => {
        expect(searchTarget('account:abc123')).toEqual({
            path: 'books/accounts/[id]',
            id: 'abc123',
        })
    })

    it('routes a journal entry hit to the entry', () => {
        expect(searchTarget('entry:xyz789')).toEqual({
            path: 'books/journal-entries/[id]',
            id: 'xyz789',
        })
    })

    it('ignores an id it does not know', () => {
        expect(searchTarget('invoice:1')).toBeNull()
        expect(searchTarget('account:')).toBeNull()
        expect(searchTarget('plain')).toBeNull()
    })
})
