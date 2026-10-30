import { describe, expect, it } from 'vitest'
import { searchTarget } from '../tinycld/books/lib/search-target'

describe('searchTarget', () => {
    it('routes an account hit to its register', () => {
        expect(searchTarget('account:abc123')).toEqual({
            path: 'books/accounts/[id]',
            id: 'abc123',
        })
    })

    it('routes a journal entry hit to the entry screen', () => {
        expect(searchTarget('entry:xyz789')).toEqual({
            path: 'books/entries/[id]',
            id: 'xyz789',
        })
    })

    it('routes a customer hit to the customer', () => {
        expect(searchTarget('customer:abc123')).toEqual({
            path: 'books/customers/[id]',
            id: 'abc123',
        })
    })

    it('routes a vendor hit to the vendor', () => {
        expect(searchTarget('vendor:abc123')).toEqual({
            path: 'books/vendors/[id]',
            id: 'abc123',
        })
    })

    it('ignores an id it does not know', () => {
        expect(searchTarget('invoice:1')).toBeNull()
        expect(searchTarget('account:')).toBeNull()
        expect(searchTarget('entry:')).toBeNull()
        expect(searchTarget('customer:')).toBeNull()
        expect(searchTarget('vendor:')).toBeNull()
        expect(searchTarget('plain')).toBeNull()
    })

    it('ignores a kind that names an inherited object member', () => {
        expect(searchTarget('constructor:x')).toBeNull()
        expect(searchTarget('toString:x')).toBeNull()
        expect(searchTarget('__proto__:x')).toBeNull()
    })
})
