import { describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    TRANSFER_IDS,
    TRANSFER_LINES,
    TRANSFER_SEED,
    TRANSFERS,
} from '../tinycld/books/lib/transfer-fixture'
import type { BooksJournalEntries } from '../tinycld/books/types'

// A compile-time check: tsc refuses it until books_journal_entries.doc_type
// (migration 2100000002) allows 'transfer' and the types are generated again.
const docType: BooksJournalEntries['doc_type'] = 'transfer'

function rowById(id: string) {
    const row = TRANSFERS.find(entry => entry.id === id)
    if (!row) throw new Error(`no fixture transfer ${id}`)
    return row
}

describe('transfer fixture', () => {
    it('types the document type as the generated entry type', () => {
        expect(docType).toBe('transfer')
    })

    it('makes every transfer a manual entry of type transfer', () => {
        for (const row of TRANSFERS) {
            expect({ id: row.id, doc_type: row.doc_type, origin: row.origin }).toEqual({
                id: row.id,
                doc_type: 'transfer',
                origin: 'manual',
            })
        }
    })

    it('gives every transfer two lines: position 0 credits From, position 1 debits To', () => {
        for (const row of TRANSFERS) {
            const lines = TRANSFER_LINES[row.id]
            expect(lines).toHaveLength(2)
            const [from, to] = lines
            expect({ position: from.position, credit: from.credit, debit: from.debit }).toEqual({
                position: 0,
                credit: row.total,
                debit: 0,
            })
            expect({ position: to.position, debit: to.debit, credit: to.credit }).toEqual({
                position: 1,
                debit: row.total,
                credit: 0,
            })
        }
    })

    it('makes the correction replace the original under the same number', () => {
        const correction = rowById(TRANSFER_IDS.correction)
        const original = rowById(TRANSFER_IDS.original)
        expect(correction.replaces).toBe(TRANSFER_IDS.original)
        expect(correction.number).toBe('TR-1')
        expect(original.number).toBe('TR-1')
    })

    it('seeds a transfer between two different bank accounts of the seeded chart', () => {
        const bankNumbers = SEED_ACCOUNTS.filter(account => account.type === 'bank').map(
            account => account.number
        )
        expect(bankNumbers).toContain(TRANSFER_SEED.fromNumber)
        expect(bankNumbers).toContain(TRANSFER_SEED.toNumber)
        expect(TRANSFER_SEED.fromNumber).not.toBe(TRANSFER_SEED.toNumber)
    })

    it('seeds a positive whole-cent amount under the 10^15-cent limit', () => {
        expect(Number.isInteger(TRANSFER_SEED.amount)).toBe(true)
        expect(TRANSFER_SEED.amount).toBeGreaterThan(0)
        expect(TRANSFER_SEED.amount).toBeLessThan(10 ** 15)
    })
})
