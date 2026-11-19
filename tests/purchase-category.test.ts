import { describe, expect, it } from 'vitest'
import { categoryOf, categoryText } from '../tinycld/books/lib/purchase-category'

// The Category column (spec §3 "Rows and columns", §4 "Category"): one line gives its
// account's or product's name, two lines read "Split", no line reads "—".

const ACCOUNT = 'acct00000006100'
const PRODUCT = 'prod00000000001'
const accountLine = { account: ACCOUNT, product: '' }
const productLine = { account: '', product: PRODUCT }

const names = {
    accounts: new Map([[ACCOUNT, 'Office supplies']]),
    products: new Map([[PRODUCT, 'Printer paper']]),
}

describe('categoryOf', () => {
    it('is none for no line', () => {
        expect(categoryOf([])).toEqual({ kind: 'none' })
    })

    it('is the account for one account line', () => {
        expect(categoryOf([accountLine])).toEqual({ kind: 'account', id: ACCOUNT })
    })

    it('is the product for one product line', () => {
        expect(categoryOf([productLine])).toEqual({ kind: 'product', id: PRODUCT })
    })

    it('is none for one line with neither account nor product', () => {
        expect(categoryOf([{ account: '', product: '' }])).toEqual({ kind: 'none' })
    })

    it('is split for two lines', () => {
        expect(categoryOf([accountLine, productLine])).toEqual({ kind: 'split' })
        expect(categoryOf([accountLine, accountLine])).toEqual({ kind: 'split' })
    })
})

describe('categoryText', () => {
    it('reads "—" for none', () => {
        expect(categoryText({ kind: 'none' }, names)).toBe('—')
    })

    it("reads the account's name", () => {
        expect(categoryText({ kind: 'account', id: ACCOUNT }, names)).toBe('Office supplies')
    })

    it("reads the product's name", () => {
        expect(categoryText({ kind: 'product', id: PRODUCT }, names)).toBe('Printer paper')
    })

    it('reads "Split" for split', () => {
        expect(categoryText({ kind: 'split' }, names)).toBe('Split')
    })

    it('reads "—" for an id whose name is not loaded', () => {
        expect(categoryText({ kind: 'account', id: 'acct00000009999' }, names)).toBe('—')
        expect(categoryText({ kind: 'product', id: 'prod00000009999' }, names)).toBe('—')
    })
})
