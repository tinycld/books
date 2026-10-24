import { createLiveQueryCollection, eq } from '@tanstack/db'
import { createCollection, disconnectRealtime, materialize } from 'pbtsdb/core'
import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

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

// A PocketBase client whose network layer serves in-memory tables, so the real
// pbtsdb collections sync and filter exactly as they do against a server.
class OfflinePocketBase extends PocketBase {
    tables: Record<string, Record<string, unknown>[]> = {}
    requests: string[] = []

    constructor() {
        super('http://127.0.0.1:1')
        this.autoCancellation(false)
    }

    override async send<T = unknown>(
        path: string,
        options: { query?: Record<string, unknown> }
    ): Promise<T> {
        this.requests.push(path)
        const name = path.split('/')[3]
        const items = this.tables[name] ?? []
        const filter = String(options.query?.filter ?? '')
        const ids = [...filter.matchAll(/id\s*=\s*['"]([^'"]+)['"]/g)].map(m => m[1])
        const matching = ids.length > 0 ? items.filter(r => ids.includes(String(r.id))) : items
        const page = Number(options.query?.page ?? 1)
        const perPage = Number(options.query?.perPage ?? 30)
        const rows = matching.slice((page - 1) * perPage, page * perPage)
        return { page, perPage, totalItems: matching.length, totalPages: 1, items: rows } as T
    }
}

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
