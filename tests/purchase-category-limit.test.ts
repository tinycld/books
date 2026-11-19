import { createLiveQueryCollection, eq } from '@tanstack/db'
import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import { createCollection, disconnectRealtime, materialize } from 'pbtsdb/core'
import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

// The category read of the purchase lists takes each document's first two lines with a
// to-many materialize() and `.limit(2)`. The Books harness's loader ignores `limit`, so
// this proof runs pbtsdb's real loader over a stub PocketBase whose getList honors
// perPage, the filter and the sort, as the server does.

type Row = Record<string, unknown>

// Reads the filters pbtsdb sends: `a = "x"` terms joined by `&&` and `||`, in parentheses.
function matches(row: Row, filter: string): boolean {
    const text = filter.trim()
    if (text === '') return true
    const orParts = splitTop(text, '||')
    if (orParts.length > 1) return orParts.some(part => matches(row, part))
    const andParts = splitTop(text, '&&')
    if (andParts.length > 1) return andParts.every(part => matches(row, part))
    if (text.startsWith('(') && text.endsWith(')')) return matches(row, text.slice(1, -1))
    const term = /^([\w.]+)\s*(=|!=)\s*(?:"([^"]*)"|'([^']*)'|(-?[\d.]+))$/.exec(text)
    if (!term) throw new Error(`stub cannot read the filter term: ${text}`)
    const [, field, op, dq, sq, num] = term
    const value = dq ?? sq ?? Number(num)
    const equal = String(row[field]) === String(value)
    return op === '=' ? equal : !equal
}

function splitTop(text: string, sep: string): string[] {
    const parts: string[] = []
    let depth = 0
    let quote = ''
    let start = 0
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (quote) {
            if (ch === quote) quote = ''
            continue
        }
        if (ch === '"' || ch === "'") quote = ch
        else if (ch === '(') depth++
        else if (ch === ')') depth--
        else if (depth === 0 && text.startsWith(sep, i)) {
            parts.push(text.slice(start, i))
            start = i + sep.length
            i += sep.length - 1
        }
    }
    parts.push(text.slice(start))
    return parts.map(p => p.trim())
}

function sorted(rows: Row[], sort: string): Row[] {
    const keys = sort
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
    return [...rows].sort((a, b) => {
        for (const key of keys) {
            const desc = key.startsWith('-')
            const field = desc ? key.slice(1) : key.replace(/^\+/, '')
            const x = a[field] as number | string
            const y = b[field] as number | string
            if (x === y) continue
            const order = x < y ? -1 : 1
            return desc ? -order : order
        }
        return 0
    })
}

class ServerLikePocketBase extends PocketBase {
    tables: Record<string, Row[]> = {}
    calls: { name: string; filter: string; sort: string; perPage: number }[] = []

    constructor() {
        super('http://127.0.0.1:1')
        this.autoCancellation(false)
    }

    override async send<T = unknown>(
        path: string,
        options: { query?: Record<string, unknown>; filter?: unknown; sort?: unknown }
    ): Promise<T> {
        const name = path.split('/')[3]
        const filter = String(options.query?.filter ?? options.filter ?? '')
        const sort = String(options.query?.sort ?? options.sort ?? '')
        const page = Number(options.query?.page ?? 1)
        const perPage = Number(options.query?.perPage ?? 30)
        this.calls.push({ name, filter, sort, perPage })
        const matching = sorted(
            (this.tables[name] ?? []).filter(row => matches(row, filter)),
            sort
        )
        const items = matching.slice((page - 1) * perPage, page * perPage)
        const totalPages = Math.max(1, Math.ceil(matching.length / perPage))
        return { page, perPage, totalItems: matching.length, totalPages, items } as T
    }
}

const STAMP = '2026-10-01 00:00:00.000Z'

function bill(id: string) {
    return { id, vendor: '', status: 'draft', created: STAMP, updated: STAMP }
}

function line(id: string, billId: string, position: number) {
    return {
        id,
        bill: billId,
        kind: 'account',
        account: `acct-${id}`,
        product: '',
        description: '',
        quantity: 0,
        rate: 0,
        amount: 100,
        position,
        created: STAMP,
        updated: STAMP,
    }
}

describe('a to-many materialize with .limit(2) on the real pbtsdb loader', () => {
    it('gives each bill its own first two lines by position', async () => {
        const pb = new ServerLikePocketBase()
        disconnectRealtime(pb)
        const newCollection = createCollection<Schema>(pb)
        const users = newCollection('users')
        // CoreStores is core's whole store object (about 30 collections) and is built only
        // by core's lib/pocketbase.ts, which boots the app config; registerCollections reads
        // only `users` from it, so this partial object stands in for the rest.
        const books = registerCollections(newCollection, {
            users,
        } as Partial<CoreStores> as CoreStores)
        pb.tables.books_bills = [
            bill('billone0000001'),
            bill('billtwo0000001'),
            bill('billthree00001'),
        ]
        // Inserted out of position order, so the sort must do the work.
        pb.tables.books_bill_lines = [
            line('l1a00000000001', 'billone0000001', 0),
            line('l2b00000000001', 'billtwo0000001', 1),
            line('l2a00000000001', 'billtwo0000001', 0),
            line('l3c00000000001', 'billthree00001', 2),
            line('l3a00000000001', 'billthree00001', 0),
            line('l3b00000000001', 'billthree00001', 1),
        ]
        const query = createLiveQueryCollection(q =>
            q.from({ bill: books.books_bills }).select(({ bill }) => ({
                ...bill,
                lines: materialize(
                    q
                        .from({ line: books.books_bill_lines })
                        .where(({ line }) => eq(line.bill, bill.id))
                        .orderBy(({ line }) => line.position)
                        .limit(2)
                ),
            }))
        )
        await query.preload()
        await new Promise(resolve => setTimeout(resolve, 50))
        type Out = { id: string; lines?: { id: string }[] }
        const rows = new Map(
            (query.toArray as Out[]).map(r => [r.id, (r.lines ?? []).map(l => l.id)])
        )
        expect(rows.get('billone0000001')).toEqual(['l1a00000000001'])
        expect(rows.get('billtwo0000001')).toEqual(['l2a00000000001', 'l2b00000000001'])
        expect(rows.get('billthree00001')).toEqual(['l3a00000000001', 'l3b00000000001'])
        // The loader asks for the lines of every parent in one page with no limit of 2
        // (perPage 1000 as of pbtsdb today); the per-bill limit is applied on the client.
        const lineCalls = pb.calls.filter(call => call.name === 'books_bill_lines')
        expect(lineCalls.every(call => call.perPage !== 2)).toBe(true)
    })
})
