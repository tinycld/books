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

    it('is a bank statement of fifteen transactions with memos and check numbers', () => {
        const { text } = REVIEW_SEED_STATEMENT
        expect(text.startsWith('OFXHEADER')).toBe(true)
        expect(text).toContain('<STMTRS>')
        expect(countOf(text, '<STMTTRN>')).toBe(15)
        expect(countOf(text, '<MEMO>')).toBeGreaterThanOrEqual(3)
        expect(countOf(text, '<CHECKNUM>')).toBeGreaterThanOrEqual(2)
        // No ledger balance, so 1000's card shows no statement line.
        expect(text).not.toContain('<LEDGERBAL>')
    })

    // Bank-match spec §4 "Fixture and seed": two lines whose amount and date fit Books
    // transactions the seed posts on 1000 (expense 1002 to Pacific Power, the partial bill
    // payment of $400.00), so the seeded book shows a suggestion and a matched row.
    // Bank-categorize spec §4 "Fixture and seed": then one Spent line the seed categorizes
    // to 6200, so the Reviewed tab shows an added row.
    it('ends with the three rows the bank match and categorize seeds read', () => {
        const blocks = REVIEW_SEED_STATEMENT.text.split('<STMTTRN>').slice(1)
        const last = blocks.slice(-3)
        expect(last[0]).toContain('<FITID>chk2026100013')
        expect(last[0]).toContain('<DTPOSTED>20261006')
        expect(last[0]).toContain('<TRNAMT>-138.37')
        expect(last[0]).toContain('<NAME>PACIFIC POWER AUTOPAY')
        expect(last[1]).toContain('<FITID>chk2026100014')
        expect(last[1]).toContain('<DTPOSTED>20261007')
        expect(last[1]).toContain('<TRNAMT>-400.00')
        expect(last[1]).toContain('<NAME>ONLINE BILL PAY 0915')
        expect(last[2]).toContain('<FITID>chk2026100015')
        expect(last[2]).toContain('<DTPOSTED>20261020')
        expect(last[2]).toContain('<TRNAMT>-24.00')
        expect(last[2]).toContain('<NAME>DROPBOX BUSINESS')
        expect(REVIEW_SEED_STATEMENT.suggestedFitid).toBe('chk2026100013')
        expect(REVIEW_SEED_STATEMENT.matchedFitid).toBe('chk2026100014')
        expect(REVIEW_SEED_STATEMENT.categorizedFitid).toBe('chk2026100015')
        expect(REVIEW_SEED_STATEMENT.categorizedDescription).toBe('DROPBOX BUSINESS')
        expect(REVIEW_SEED_STATEMENT.categorizedAmountCents).toBe(2400)
        for (const fitid of ['chk2026100013', 'chk2026100014', 'chk2026100015']) {
            expect(REVIEW_SEED_STATEMENT.excludedFitids).not.toContain(fitid)
        }
    })

    it('categorizes its last row to the seeded 6200 expense account', () => {
        expect(REVIEW_SEED_STATEMENT.categorizedAccountNumber).toBe('6200')
        const account = SEED_ACCOUNTS.find(
            row => row.number === REVIEW_SEED_STATEMENT.categorizedAccountNumber
        )
        expect(account?.type).toBe('expense')
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
