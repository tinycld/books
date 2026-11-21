import { describe, expect, it } from 'vitest'
import { categorizeSchema } from '../tinycld/books/lib/bank-categorize'
import {
    CAT_ACCOUNTS,
    CAT_CATEGORIZATIONS,
    CAT_CURRENCY,
    CAT_ENTRIES,
    CAT_FORMS,
    CAT_LINES,
    CAT_LONG_ACCOUNT_NUMBER,
    CAT_MATCHES,
    CAT_PARTIES,
    CAT_TRANSACTIONS,
    CAT_TXN_IDS,
    type CatFormName,
} from '../tinycld/books/lib/bank-categorize-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

// The reference route's data must hold the rules the real collections hold, so a shot of
// it shows a state the app can reach.

const ID_LENGTH = 15

describe('bank-categorize fixture', () => {
    it('gives every row a unique 15-character id', () => {
        const ids = [
            ...CAT_ACCOUNTS,
            ...CAT_TRANSACTIONS,
            ...CAT_ENTRIES,
            ...CAT_LINES,
            ...CAT_CATEGORIZATIONS,
            ...CAT_MATCHES,
            ...CAT_PARTIES,
        ].map(row => row.id)
        expect(ids.length).toBeGreaterThan(0)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) expect(id.length, id).toBe(ID_LENGTH)
    })

    it('files each categorization under a Reviewed transaction and an entry', () => {
        const entryIds = new Set(CAT_ENTRIES.map(entry => entry.id))
        expect(CAT_CATEGORIZATIONS.length).toBeGreaterThan(0)
        for (const row of CAT_CATEGORIZATIONS) {
            const txn = CAT_TRANSACTIONS.find(candidate => candidate.id === row.bank_transaction)
            expect(txn?.status, row.id).toBe('reviewed')
            expect(entryIds.has(row.entry), row.id).toBe(true)
        }
    })

    it('names only seeded accounts, but the one long account', () => {
        const seeded = new Set(SEED_ACCOUNTS.map(account => account.number))
        const numbers = CAT_ACCOUNTS.map(account => account.number).filter(
            number => number !== CAT_LONG_ACCOUNT_NUMBER
        )
        expect(numbers.length).toBeGreaterThan(0)
        for (const number of numbers) expect(seeded.has(number), number).toBe(true)
        expect(seeded.has(CAT_LONG_ACCOUNT_NUMBER)).toBe(false)
    })

    // A form name says whether it is complete: "empty" and "splitShort" are not.
    const BANK_TXN_OF: Record<CatFormName, string> = {
        empty: CAT_TXN_IDS.spent,
        filled: CAT_TXN_IDS.spent,
        split: CAT_TXN_IDS.split,
        splitShort: CAT_TXN_IDS.split,
        long: CAT_TXN_IDS.longDescription,
    }
    const VALID: Record<CatFormName, boolean> = {
        empty: false,
        filled: true,
        split: true,
        splitShort: false,
        long: true,
    }

    for (const name of Object.keys(CAT_FORMS) as CatFormName[]) {
        it(`parses the ${name} form as ${VALID[name] ? 'valid' : 'invalid'}`, () => {
            const txn = CAT_TRANSACTIONS.find(row => row.id === BANK_TXN_OF[name])
            expect(txn, name).toBeDefined()
            const form = CAT_FORMS[name]
            const values = {
                payee: form.payee,
                memo: form.memo,
                lines: form.lines.map(line => ({ ...line })),
            }
            const result = categorizeSchema(txn?.amount ?? 0, CAT_CURRENCY).safeParse(values)
            expect(result.success).toBe(VALID[name])
        })
    }
})
