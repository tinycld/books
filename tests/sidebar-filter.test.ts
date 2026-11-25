import { describe, expect, it } from 'vitest'
import { filterTerms, matchesTerms } from '../tinycld/books/lib/sidebar-filter'

describe('filterTerms', () => {
    it('splits on white space, in lower case, and drops empty words', () => {
        expect(filterTerms('  Sales   BY ')).toEqual(['sales', 'by'])
        expect(filterTerms('   ')).toEqual([])
    })
})

describe('matchesTerms', () => {
    it('matches when every word is in one of the texts, in any order', () => {
        expect(matchesTerms(['cust', 'sales'], ['Sales by Customer', 'Report'])).toBe(true)
        expect(matchesTerms(['new', 'inv'], ['Invoice', 'New'])).toBe(true)
    })

    it('does not match when one word is missing', () => {
        expect(matchesTerms(['sales', 'vendor'], ['Sales by Customer', 'Report'])).toBe(false)
    })

    it('matches everything with no words', () => {
        expect(matchesTerms([], ['Dashboard'])).toBe(true)
    })
})
