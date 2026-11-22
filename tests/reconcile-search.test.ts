import { describe, expect, it } from 'vitest'
import { hasReconcileFilter, hasSearchText } from '../tinycld/books/lib/reconcile'
import { parseSearchAmount } from '../tinycld/books/lib/search-amount'

// One rule for "the search has text": "Clear filters" (hasReconcileFilter) and Esc
// (useReconcileShortcuts) both trim it, so a search of only spaces offers neither.

describe('hasSearchText', () => {
    it('is false for an empty search and for one of only spaces', () => {
        expect(hasSearchText('')).toBe(false)
        expect(hasSearchText('   ')).toBe(false)
    })

    it('is true for a search with text', () => {
        expect(hasSearchText(' rent ')).toBe(true)
    })

    it('is the rule hasReconcileFilter reads for the search', () => {
        const filters = { side: 'all', show: 'all' } as const
        expect(hasReconcileFilter({ ...filters, search: '   ' })).toBe(false)
        expect(hasReconcileFilter({ ...filters, search: 'rent' })).toBe(true)
    })
})

describe('parseSearchAmount', () => {
    it('takes the currency from every caller', () => {
        // @ts-expect-error the currency is required: a caller cannot omit it by mistake.
        expect(parseSearchAmount('250')).toBe(25000)
        expect(parseSearchAmount('250', 'USD')).toBe(25000)
    })
})
