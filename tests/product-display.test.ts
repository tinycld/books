import { describe, expect, it } from 'vitest'
import {
    productDeleteLines,
    productListCopy,
    productsEmptyHint,
    productTitle,
} from '../tinycld/books/lib/product-display'

const WRITER_HINT = 'Add what you sell and what you buy.'
const READER_HINT = 'Products and services appear here once a bookkeeper adds them.'
const REFUSAL = 'This item is in 2 bundles. Take it out of them first, or make it inactive.'
const NAME_LINE = { key: 'name', text: 'Cable', tone: 'plain' }
const EXPLANATION_LINE = { key: 'explanation', text: 'This cannot be undone.', tone: 'muted' }
const BUNDLE_LINE = { key: 'bundle', text: 'Its item list is deleted with it.', tone: 'muted' }
const UNSAVED_LINE = {
    key: 'unsaved',
    text: 'Unsaved changes to this product will be lost.',
    tone: 'plain',
}
const REFUSAL_LINE = { key: 'refusal', text: REFUSAL, tone: 'error' }

const CLEAN_ITEM = { name: 'Cable', isBundle: false, isOpenAndDirty: false, refusal: null }

describe('productDeleteLines', () => {
    it('names the product and says the delete cannot be undone', () => {
        expect(productDeleteLines(CLEAN_ITEM)).toEqual([NAME_LINE, EXPLANATION_LINE])
    })

    it('adds the item-list line third for a bundle', () => {
        expect(productDeleteLines({ ...CLEAN_ITEM, isBundle: true })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            BUNDLE_LINE,
        ])
    })

    it('adds the unsaved-changes line after the bundle line when the open product is dirty', () => {
        expect(productDeleteLines({ ...CLEAN_ITEM, isOpenAndDirty: true })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            UNSAVED_LINE,
        ])
        expect(productDeleteLines({ ...CLEAN_ITEM, isBundle: true, isOpenAndDirty: true })).toEqual(
            [NAME_LINE, EXPLANATION_LINE, BUNDLE_LINE, UNSAVED_LINE]
        )
    })

    it("ends with the server's refusal as an error line", () => {
        const lines = productDeleteLines({
            ...CLEAN_ITEM,
            isBundle: true,
            isOpenAndDirty: true,
            refusal: REFUSAL,
        })
        expect(lines).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            BUNDLE_LINE,
            UNSAVED_LINE,
            REFUSAL_LINE,
        ])
        expect(lines.at(-1)).toEqual(REFUSAL_LINE)
        expect(productDeleteLines({ ...CLEAN_ITEM, refusal: REFUSAL })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            REFUSAL_LINE,
        ])
    })

    it('shows no refusal line for an empty refusal', () => {
        expect(productDeleteLines({ ...CLEAN_ITEM, refusal: '' })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
        ])
    })
})

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
