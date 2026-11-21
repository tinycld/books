import { describe, expect, it } from 'vitest'
import {
    MATCH_ACCOUNT_LABEL,
    MATCH_LINES,
    MATCH_MATCH_LINES,
    MATCH_MATCHES,
    MATCH_SUGGESTIONS,
    MATCH_TRANSACTIONS,
} from '../tinycld/books/lib/bank-match-fixture'
import type {
    BooksBankMatches,
    BooksBankMatchLines,
    BooksBankMatchSuggestions,
} from '../tinycld/books/types'

// The reference rows are typed by the records the match migration generates, so a field
// the migration renames or drops fails the typecheck here, not on the reference route.
const TYPED: {
    matches: BooksBankMatches[]
    lines: BooksBankMatchLines[]
    suggestions: BooksBankMatchSuggestions[]
} = { matches: MATCH_MATCHES, lines: MATCH_MATCH_LINES, suggestions: MATCH_SUGGESTIONS }

describe('bank-match fixture', () => {
    it('suggests only journal lines, for For review bank transactions', () => {
        const lineIds = new Set(MATCH_LINES.map(line => line.id))
        expect(TYPED.suggestions.length).toBeGreaterThan(0)
        for (const row of TYPED.suggestions) {
            const txn = MATCH_TRANSACTIONS.find(candidate => candidate.id === row.bank_transaction)
            expect(txn?.status, row.id).toBe('for_review')
            expect(lineIds.has(row.line), row.id).toBe(true)
        }
    })

    it('files every match line under a match', () => {
        const matchIds = new Set(TYPED.matches.map(match => match.id))
        expect(TYPED.lines.length).toBeGreaterThan(0)
        for (const row of TYPED.lines) {
            expect(matchIds.has(row.match), row.id).toBe(true)
        }
    })

    it('adds up each match to its bank amount', () => {
        for (const match of TYPED.matches) {
            const txn = MATCH_TRANSACTIONS.find(row => row.id === match.bank_transaction)
            const sum = TYPED.lines
                .filter(row => row.match === match.id)
                .reduce((total, row) => total + row.amount, 0)
            expect(sum, match.id).toBe(Math.abs(txn?.amount ?? 0))
        }
    })

    it('names the seeded checking account', () => {
        expect(MATCH_ACCOUNT_LABEL).toBe('1000 Business Checking')
    })
})
