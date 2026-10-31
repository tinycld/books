import { describe, expect, it } from 'vitest'
import {
    productListCopy,
    productsEmptyHint,
    productTitle,
} from '../tinycld/books/lib/product-display'

const WRITER_HINT = 'Add what you sell and what you buy.'
const READER_HINT = 'Products and services appear here once a bookkeeper adds them.'

describe('productsEmptyHint', () => {
    it('asks a writer to add what they sell and buy', () => {
        expect(productsEmptyHint(true)).toBe(WRITER_HINT)
    })

    it('tells a read-only user that a bookkeeper adds them', () => {
        expect(productsEmptyHint(false)).toBe(READER_HINT)
    })
})

describe('productListCopy', () => {
    it('names the products and services list for a writer', () => {
        expect(productListCopy(true)).toEqual({
            title: 'Products and services',
            singular: 'product or service',
            plural: 'products or services',
            searchPlaceholder: 'Search products and services',
            emptyHint: WRITER_HINT,
        })
    })

    it("gives a read-only user the reader's hint", () => {
        expect(productListCopy(false).emptyHint).toBe(READER_HINT)
    })
})

describe('productTitle', () => {
    it('names a writer the action and the noun of the type', () => {
        expect(productTitle('service', { mode: 'new', canWrite: true })).toBe('New service')
        expect(productTitle('non_inventory', { mode: 'edit', canWrite: true })).toBe(
            'Edit non-inventory item'
        )
        expect(productTitle('bundle', { mode: 'edit', canWrite: true })).toBe('Edit bundle')
    })

    it('gives a read-only user the noun alone, capitalized', () => {
        expect(productTitle('service', { mode: 'edit', canWrite: false })).toBe('Service')
        expect(productTitle('non_inventory', { mode: 'edit', canWrite: false })).toBe(
            'Non-inventory item'
        )
        expect(productTitle('bundle', { mode: 'edit', canWrite: false })).toBe('Bundle')
    })
})
