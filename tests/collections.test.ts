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
        expect(calls.get('books_journal_lines')?.relations).toEqual({
            account: { name: 'books_accounts' },
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
    })
})
