import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    DEPOSIT_FIXTURE_ACCOUNTS,
    DEPOSIT_ITEMS,
    DEPOSIT_LINES,
    DEPOSIT_SEED,
    DEPOSITS,
    depositItemsOf,
    depositLinesOf,
    UNDEPOSITED_ITEMS,
    UNDEPOSITED_ITEMS_TWO_ACCOUNTS,
} from '../tinycld/books/lib/bank-deposit-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import type {
    BooksDepositItems,
    BooksDepositLines,
    BooksDeposits,
    BooksUndepositedItems,
} from '../tinycld/books/types'

// The bank deposit fixture (bank deposit spec §4.1) against the generated schema: every
// row is a row of its collection, its sums are the server's, its ids are PocketBase ids,
// and what the seed posts names accounts the seeded book has.

// The fields the generated zod schema of a collection lists (from the migrations):
// `books_deposit_items` → `booksDepositItemsSchema`.
function schemaFields(collection: string): string[] {
    const name = `${collection.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}Schema`
    const schema = (zodSchemas as Record<string, unknown>)[name]
    if (!schema || typeof schema !== 'object' || !('shape' in schema)) {
        throw new Error(`no generated schema ${name} for ${collection}`)
    }
    return Object.keys(schema.shape as object).sort()
}

// The view's rows carry no autodate columns; the stored rows do.
const ROWS = [
    { collection: 'books_deposits', rows: DEPOSITS },
    { collection: 'books_deposit_items', rows: DEPOSIT_ITEMS },
    { collection: 'books_deposit_lines', rows: DEPOSIT_LINES },
    { collection: 'books_undeposited_items', rows: UNDEPOSITED_ITEMS_TWO_ACCOUNTS },
]

describe('the bank deposit fixture against the generated types', () => {
    it('types every row as its generated record type', () => {
        expectTypeOf(DEPOSITS).toMatchTypeOf<BooksDeposits[]>()
        expectTypeOf(DEPOSIT_ITEMS).toMatchTypeOf<BooksDepositItems[]>()
        expectTypeOf(DEPOSIT_LINES).toMatchTypeOf<BooksDepositLines[]>()
        expectTypeOf(UNDEPOSITED_ITEMS).toMatchTypeOf<BooksUndepositedItems[]>()
        expectTypeOf<BooksUndepositedItems['amount']>().toEqualTypeOf<number>()
        expectTypeOf<BooksUndepositedItems['payment_method']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['reference_no']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['account']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['customer']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['vendor']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['entry']>().toEqualTypeOf<string>()
        expectTypeOf<BooksUndepositedItems['line']>().toEqualTypeOf<string>()
        expectTypeOf<BooksDeposits['total']>().toEqualTypeOf<number>()
        expectTypeOf<BooksDepositItems['posted']>().toEqualTypeOf<boolean>()
    })

    it.each(ROWS)('$collection: every row holds the fields of the generated schema', ({
        collection,
        rows,
    }) => {
        const fields = schemaFields(collection)
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(Object.keys(row).sort(), `${collection} ${row.id}`).toEqual(fields)
        }
    })
})

describe('the bank deposit fixture data', () => {
    it('gives each posted or void deposit the totals of its items and its lines', () => {
        const stored = DEPOSITS.filter(d => d.status !== 'draft')
        expect(stored.length).toBeGreaterThan(0)
        for (const d of stored) {
            const items = depositItemsOf(d.id).reduce((sum, row) => sum + row.amount, 0)
            const lines = depositLinesOf(d.id).reduce((sum, row) => sum + row.amount, 0)
            expect(d.items_total, `${d.id} items_total`).toBe(items)
            expect(d.lines_total, `${d.id} lines_total`).toBe(lines)
            expect(d.total, `${d.id} total`).toBe(items + lines)
        }
    })

    it('gives every row a 15-character id, and every id it names too', () => {
        const ids = [
            ...DEPOSITS.flatMap(d => [d.id, d.deposit_to, d.entry, d.replaces, d.replaced_by]),
            ...DEPOSIT_ITEMS.flatMap(i => [
                i.id,
                i.deposit,
                i.line,
                i.entry,
                i.account,
                i.document,
            ]),
            ...DEPOSIT_LINES.flatMap(l => [l.id, l.deposit, l.account, l.customer, l.vendor]),
            ...UNDEPOSITED_ITEMS_TWO_ACCOUNTS.flatMap(u => [u.id, u.line, u.entry, u.account]),
            ...DEPOSIT_FIXTURE_ACCOUNTS.map(a => a.id),
        ].filter(id => id !== '')
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('names, in what the seed posts and in the fixture accounts, accounts the seeded book has', () => {
        const seeded = new Map(SEED_ACCOUNTS.map(a => [a.number, a]))
        const line = seeded.get(DEPOSIT_SEED.deposit.line.accountNumber)
        expect(line, `seeded account ${DEPOSIT_SEED.deposit.line.accountNumber}`).toBeDefined()
        // The accounts the deposit form reads in the seeded book, beside the fixture-only
        // second Undeposited funds account.
        for (const account of DEPOSIT_FIXTURE_ACCOUNTS.filter(a => a.number !== '1210')) {
            const row = seeded.get(account.number)
            expect(row, `seeded account ${account.number}`).toBeDefined()
            expect(
                [row?.name, row?.type, row?.detail_type],
                `seeded account ${account.number}`
            ).toEqual([account.name, account.type, account.detail_type])
        }
    })
})
