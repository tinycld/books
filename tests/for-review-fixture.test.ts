import { describe, expect, it } from 'vitest'
import { BANK_SEED_FILE } from '../tinycld/books/lib/bank-connection-fixture'
import { REVIEW_SEED_STATEMENT, REVIEW_TRANSACTIONS } from '../tinycld/books/lib/for-review-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

function countOf(text: string, tag: string): number {
    return text.split(tag).length - 1
}

describe('for-review fixture', () => {
    it('seeds the statement on the seeded 1000 bank account', () => {
        expect(REVIEW_SEED_STATEMENT.accountNumber).toBe('1000')
        const account = SEED_ACCOUNTS.find(
            row => row.number === REVIEW_SEED_STATEMENT.accountNumber
        )
        expect(account?.type).toBe('bank')
    })

    it('is an OFX file with a name of its own', () => {
        expect(REVIEW_SEED_STATEMENT.name.endsWith('.ofx')).toBe(true)
        expect(REVIEW_SEED_STATEMENT.name).not.toBe(BANK_SEED_FILE.name)
    })

    it('is a bank statement of twelve transactions with memos and check numbers', () => {
        const { text } = REVIEW_SEED_STATEMENT
        expect(text.startsWith('OFXHEADER')).toBe(true)
        expect(text).toContain('<STMTRS>')
        expect(countOf(text, '<STMTTRN>')).toBe(12)
        expect(countOf(text, '<MEMO>')).toBeGreaterThanOrEqual(3)
        expect(countOf(text, '<CHECKNUM>')).toBeGreaterThanOrEqual(2)
        // No ledger balance, so 1000's card shows no statement line.
        expect(text).not.toContain('<LEDGERBAL>')
    })

    it('excludes four of its own transactions', () => {
        const fitids = new Set(
            [...REVIEW_SEED_STATEMENT.text.matchAll(/<FITID>([^\s<]+)/g)].map(match => match[1])
        )
        expect(REVIEW_SEED_STATEMENT.excludedFitids).toHaveLength(4)
        expect(new Set(REVIEW_SEED_STATEMENT.excludedFitids).size).toBe(4)
        for (const fitid of REVIEW_SEED_STATEMENT.excludedFitids) {
            expect(fitids.has(fitid), fitid).toBe(true)
        }
    })

    it('gives every reference transaction a unique 15-character id', () => {
        const ids = REVIEW_TRANSACTIONS.map(row => row.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) {
            expect(id.length, id).toBe(15)
        }
    })
})
