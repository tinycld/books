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

    it('routes a product hit to the product', () => {
        expect(searchTarget('product:abc123')).toEqual({
            path: 'books/products/[id]',
            id: 'abc123',
        })
    })

    it('routes a transfer hit to the transfer screen', () => {
        expect(searchTarget('transfer:abc')).toEqual({
            path: 'books/transfers/[id]',
            id: 'abc',
        })
    })

    it('routes an invoice hit to the invoice screen', () => {
        expect(searchTarget('invoice:abc')).toEqual({
            path: 'books/invoices/[id]',
            id: 'abc',
        })
    })

    it('routes a sales receipt hit to the sales receipt screen', () => {
        expect(searchTarget('sales_receipt:abc')).toEqual({
            path: 'books/sales-receipts/[id]',
            id: 'abc',
        })
    })

    it('routes an estimate hit to the estimate screen', () => {
        expect(searchTarget('estimate:abc')).toEqual({
            path: 'books/estimates/[id]',
            id: 'abc',
        })
    })

    it('ignores an id it does not know', () => {
        expect(searchTarget('quote:1')).toBeNull()
        expect(searchTarget('invoice:')).toBeNull()
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
