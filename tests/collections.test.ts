import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

const NAMES = [
    'books_accounts',
    'books_journal_lines',
    'books_journal_entries',
    'books_account_balances',
    'books_settings',
    'books_doc_sequences',
    'books_close_overrides',
    'books_admins',
    'books_access',
    'books_customers',
    'books_vendors',
    'books_products',
    'books_bundle_items',
]

function register() {
    const calls = new Map<string, Record<string, unknown>>()
    const newCollection = (name: string, options: Record<string, unknown>) => {
        calls.set(name, options)
        return { name }
    }
    const users = { name: 'users' }
    const result = registerCollections(newCollection as never, { users } as never)
    return { calls, result }
}

describe('registerCollections', () => {
    it('registers every Books collection', () => {
        const { result } = register()
        expect(Object.keys(result).sort()).toEqual([...NAMES].sort())
    })

    it('syncs every collection on demand with per-query realtime', () => {
        const { calls } = register()
        for (const name of NAMES) {
            expect(calls.get(name)?.syncMode).toBe('on-demand')
            expect(calls.get(name)?.realtime).toBe('query')
        }
    })

    it('declares the relations the ledger screens read', () => {
        const { calls } = register()
        // Spike outcome (a): the lines reach their entry through a relation.
        expect(calls.get('books_journal_lines')?.relations).toEqual({
            account: { name: 'books_accounts' },
            entry: { name: 'books_journal_entries' },
        })
        expect(calls.get('books_journal_entries')?.relations).toEqual({
            books_journal_lines_via_entry: { name: 'books_journal_lines' },
            posted_by: { name: 'users' },
            created_by: { name: 'users' },
        })
        expect(calls.get('books_account_balances')?.relations).toEqual({
            account: { name: 'books_accounts' },
        })
    })

    it('never inserts a field Books sets itself', () => {
        const { calls } = register()
        expect(calls.get('books_journal_entries')?.omitOnInsert).toEqual(
            expect.arrayContaining([
                'number',
                'sequence',
                'total',
                'posted_at',
                'posted_by',
                'currency',
            ])
        )
        expect(calls.get('books_journal_lines')?.omitOnInsert).toEqual(
            expect.arrayContaining(['posted', 'date', 'currency'])
        )
        // The guard sets name_key and sort_key on every write, so the client never sends them.
        expect(calls.get('books_customers')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
        expect(calls.get('books_vendors')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
    })

    // The customers list materializes each row's parent through a subquery on the
    // same collection, so the collection files no related rows.
    it('declares no relations on customers', () => {
        const { calls } = register()
        expect(calls.has('books_customers')).toBe(true)
        expect(calls.get('books_customers')?.relations).toBeUndefined()
    })

    // The vendors list loads one page at a time, and the expense account picker
    // reads books_accounts itself.
    it('declares no relations on vendors', () => {
        const { calls } = register()
        expect(calls.has('books_vendors')).toBe(true)
        expect(calls.get('books_vendors')?.relations).toBeUndefined()
    })

    // The guard sets name_key and sort_key and the server stamps currency, so the client
    // never sends them on a product; a bundle row sends every column it has.
    it('never inserts a product or bundle row column the server sets', () => {
        const { calls } = register()
        expect(calls.get('books_products')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'name_key',
            'sort_key',
            'currency',
        ])
        expect(calls.get('books_bundle_items')?.omitOnInsert).toEqual(['created', 'updated'])
    })

    // The products list loads one page at a time; a bundle's rows,
    // the product picker and the account pickers read their own collections.
    it('declares no relations on products or bundle rows', () => {
        const { calls } = register()
        for (const name of ['books_products', 'books_bundle_items']) {
            expect(calls.has(name), name).toBe(true)
            expect(calls.get(name)?.relations, name).toBeUndefined()
        }
    })
})
