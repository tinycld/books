import { describe, expect, it } from 'vitest'
import {
    billTablesShown,
    noLinesText,
    PURCHASE_LINES_LABELS,
    PURCHASE_LINES_OPTIONS,
} from '../tinycld/books/lib/purchase-lines'

// The Bill lines setting and the tables a bill form shows (spec §3.11): a table shows when
// the setting includes it, or when the bill the form opens with already has a line in it,
// so editing an older bill never loses lines. Table order is kept.
describe('billTablesShown', () => {
    const none = { account_lines: 0, item_lines: 0 }

    it('shows both tables for Accounts and products', () => {
        expect(billTablesShown('both', none)).toEqual(['account_lines', 'item_lines'])
    })

    it('shows only Account details for Accounts only', () => {
        expect(billTablesShown('accounts', none)).toEqual(['account_lines'])
    })

    it('shows only Product and service details for Products only', () => {
        expect(billTablesShown('products', none)).toEqual(['item_lines'])
    })

    it('also shows the product table under Accounts only when the bill has product lines', () => {
        expect(billTablesShown('accounts', { account_lines: 1, item_lines: 2 })).toEqual([
            'account_lines',
            'item_lines',
        ])
    })

    it('also shows the account table under Products only when the bill has account lines', () => {
        expect(billTablesShown('products', { account_lines: 1, item_lines: 0 })).toEqual([
            'account_lines',
            'item_lines',
        ])
    })
})

// Post's line-count rule (spec §3.4): its text names the tables the form shows.
describe('noLinesText', () => {
    it('names both tables while both show', () => {
        expect(noLinesText(['account_lines', 'item_lines'])).toBe(
            'Add at least one account or product line'
        )
    })

    it('names the account table while only it shows', () => {
        expect(noLinesText(['account_lines'])).toBe('Add at least one account line')
    })

    it('names the product table while only it shows', () => {
        expect(noLinesText(['item_lines'])).toBe('Add at least one product line')
    })
})

describe('PURCHASE_LINES_LABELS', () => {
    it('labels the three settings', () => {
        expect(PURCHASE_LINES_LABELS).toEqual({
            both: 'Accounts and products',
            accounts: 'Accounts only',
            products: 'Products only',
        })
    })

    it('offers the three settings in that order with those labels', () => {
        expect(PURCHASE_LINES_OPTIONS).toEqual([
            { value: 'both', label: 'Accounts and products' },
            { value: 'accounts', label: 'Accounts only' },
            { value: 'products', label: 'Products only' },
        ])
    })
})
