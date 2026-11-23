import { createLiveQueryCollection, eq } from '@tanstack/db'
import { createCollection, disconnectRealtime, materialize } from 'pbtsdb/core'
import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'
import { OfflinePocketBase } from './offline-pocketbase'

// The real pbtsdb factory against a client that is never contacted: building a
// collection makes no request, so this checks what the package really registers.
function realBooks() {
    const newCollection = createCollection(new PocketBase('http://127.0.0.1:1'))
    const users = newCollection('users')
    return registerCollections(newCollection as never, { users } as never)
}

describe('registerCollections with the real pbtsdb', () => {
    it('lets the lines collection reach its entry and account collections', () => {
        const books = realBooks()
        const targets = books.books_journal_lines.relationTargets
        expect(targets?.entry).toBe(books.books_journal_entries)
        expect(targets?.account).toBe(books.books_accounts)
    })

    it('lets the entries collection reach its lines back-relation', () => {
        const books = realBooks()
        expect(books.books_journal_entries.relationTargets?.books_journal_lines_via_entry).toBe(
            books.books_journal_lines
        )
    })
})

const STAMP = '2026-10-01 00:00:00.000Z'
const ADA = { id: 'userada0000001', name: 'Ada Admin', email: 'ada@example.test' }
const BOB = { id: 'userbob0000001', name: 'Bob Books', email: 'bob@example.test' }

function realBooksWithUsers() {
    const pb = new OfflinePocketBase()
    disconnectRealtime(pb)
    const newCollection = createCollection(pb)
    const users = newCollection('users')
    const books = registerCollections(newCollection as never, { users } as never)
    return { books, users, pb }
}

describe('Books settings collections with the real pbtsdb', () => {
    it('materializes the user of a books_access row', async () => {
        const { books, users, pb } = realBooksWithUsers()
        pb.tables.users = [ADA]
        pb.tables.books_access = [{ id: 'acc1', user: ADA.id, level: 'admin' }]
        const query = createLiveQueryCollection(q =>
            q.from({ access: books.books_access }).select(({ access }) => ({
                ...access,
                member: materialize(
                    q
                        .from({ u: users })
                        .where(({ u }) => eq(u.id, access.user))
                        .findOne()
                ),
            }))
        )
        expect(books.books_access.relationTargets?.user).toBe(users)
        await query.preload()
        const row = query.toArray[0] as { member?: { name: string; email: string } }
        expect(row.member?.name).toBe('Ada Admin')
        expect(row.member?.email).toBe('ada@example.test')
    })

    it('materializes user and granted_by of an override, and keeps one with no granter', async () => {
        const { books, users, pb } = realBooksWithUsers()
        pb.tables.users = [ADA, BOB]
        const base = { reason: 'Audit fix', expires_at: STAMP, created: STAMP, updated: STAMP }
        pb.tables.books_close_overrides = [
            { id: 'ovgranted', user: BOB.id, granted_by: ADA.id, ...base },
            { id: 'ovnogrant', user: BOB.id, granted_by: '', ...base },
        ]
        const query = createLiveQueryCollection(q =>
            q.from({ ov: books.books_close_overrides }).select(({ ov }) => ({
                ...ov,
                member: materialize(
                    q
                        .from({ u: users })
                        .where(({ u }) => eq(u.id, ov.user))
                        .findOne()
                ),
                granter: materialize(
                    q
                        .from({ g: users })
                        .where(({ g }) => eq(g.id, ov.granted_by))
                        .findOne()
                ),
            }))
        )
        expect(books.books_close_overrides.relationTargets?.user).toBe(users)
        expect(books.books_close_overrides.relationTargets?.granted_by).toBe(users)
        await query.preload()
        type Row = { id: string; member?: { name: string }; granter?: { name: string } }
        const rows = new Map((query.toArray as Row[]).map(r => [r.id, r]))
        expect(rows.size).toBe(2)
        expect(rows.get('ovgranted')?.member?.name).toBe('Bob Books')
        expect(rows.get('ovgranted')?.granter?.name).toBe('Ada Admin')
        expect(rows.get('ovnogrant')?.member?.name).toBe('Bob Books')
        expect(rows.get('ovnogrant')?.granter).toBeUndefined()
    })
})

// Reconcile spec §4 "Reads": the work screen's one lines query reads the view by account
// and statement date, with materialize() of the cleared row of each line.
describe('Reconcile collections with the real pbtsdb', () => {
    it('registers the two reconciliation collections and the lines view', () => {
        const books = realBooks()
        expect(books.books_reconciliations).toBeDefined()
        expect(books.books_reconciliation_lines).toBeDefined()
        expect(books.books_reconcile_lines).toBeDefined()
    })

    it('loads the view rows of one account on demand, with the cleared row of each line', async () => {
        const { books, pb } = realBooksWithUsers()
        const view = { entry: 'entry0000000001', debit: 0, credit: 2500, memo: '', number: '12' }
        pb.tables.books_reconcile_lines = [
            {
                id: 'line00000000001',
                line: 'line00000000001',
                account: 'acctsavings0001',
                date: '2026-09-10',
                reconciliation: 'recn00000000001',
                ...view,
            },
            {
                id: 'line00000000002',
                line: 'line00000000002',
                account: 'acctsavings0001',
                date: '2026-09-12',
                reconciliation: '',
                ...view,
            },
            {
                id: 'line00000000003',
                line: 'line00000000003',
                account: 'acctchecking001',
                date: '2026-09-12',
                reconciliation: '',
                ...view,
            },
        ]
        pb.tables.books_reconciliation_lines = [
            {
                id: 'clear0000000001',
                reconciliation: 'recn00000000001',
                line: 'line00000000001',
                finished: false,
            },
        ]
        const query = createLiveQueryCollection(q =>
            q
                .from({ row: books.books_reconcile_lines })
                .where(({ row }) => eq(row.account, 'acctsavings0001'))
                .select(({ row }) => ({
                    ...row,
                    cleared: materialize(
                        q
                            .from({ c: books.books_reconciliation_lines })
                            .where(({ c }) => eq(c.line, row.line))
                            .findOne()
                    ),
                }))
        )
        await query.preload()
        type Row = { id: string; cleared?: { id: string } }
        const rows = new Map((query.toArray as Row[]).map(r => [r.id, r]))
        expect([...rows.keys()].sort()).toEqual(['line00000000001', 'line00000000002'])
        expect(rows.get('line00000000001')?.cleared?.id).toBe('clear0000000001')
        expect(rows.get('line00000000002')?.cleared).toBeUndefined()
        expect(pb.filters.some(filter => filter.includes('acctsavings0001'))).toBe(true)
    })
})

// Reconciliation report spec §4 "Schema": the reconciled lines view, one row for each cleared
// row of a finished reconciliation, is registered on demand and live on its change topic.
describe('Reconciliation report collections with the real pbtsdb', () => {
    it('registers the reconciled lines view on its change topic and loads one statement on demand', async () => {
        const { books, pb } = realBooksWithUsers()
        const view = books.books_reconciled_lines
        expect(view).toBeDefined()
        const row = { account: 'acctcard0000001', entry: 'entry0000000001', currency: 'USD' }
        pb.tables.books_reconciled_lines = [
            {
                id: 'clear0000000001',
                reconciliation: 'recn00000000001',
                date: '2026-08-07',
                debit: 0,
                credit: 48250,
                position: 0,
                memo: 'Office chairs',
                payee: '',
                ...row,
            },
            {
                id: 'clear0000000002',
                reconciliation: 'recn00000000002',
                date: '2026-08-09',
                debit: 0,
                credit: 9900,
                position: 0,
                memo: 'Software',
                payee: '',
                ...row,
            },
        ]
        const query = createLiveQueryCollection(q =>
            q.from({ line: view }).where(({ line }) => eq(line.reconciliation, 'recn00000000001'))
        )
        await query.preload()
        expect((query.toArray as { id: string }[]).map(r => r.id)).toEqual(['clear0000000001'])
        expect(pb.filters.some(filter => filter.includes('recn00000000001'))).toBe(true)
    })
})
