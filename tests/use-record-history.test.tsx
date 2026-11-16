// @vitest-environment happy-dom
import { BasicIndex, createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue } from '../tinycld/books/components/history/FieldValue'
import { useRecordHistory } from '../tinycld/books/hooks/useRecordHistory'
import { auditFieldsOf } from '../tinycld/books/lib/audit-fields'
import { type AuditLogRow, auditRow, type RowInput } from '../tinycld/books/lib/audit-log-fixture'
import { historyKey } from '../tinycld/books/stores/history-reads-store'
import { accountsStore, guardedStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

// The live record's collection (books_invoices) is not one the harness seeds: each test
// puts its own here, a ready one or one whose read is held.
const extra = vi.hoisted(() => ({ stores: {} as Record<string, unknown> }))

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return {
        useStore: (...names: string[]) =>
            useStoreStub(...names).map((store, i) => extra.stores[names[i] ?? ''] ?? store),
    }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const INVOICE = 'bkinvoice001001'
const OTHER_INVOICE = 'bkinvoice001002'
const INVOICE_PARENT = { type: 'books_invoices', id: INVOICE }

function row(input: Omit<RowInput, 'who'> & { who?: RowInput['who'] }): AuditLogRow {
    return auditRow({ who: 'priya', ...input })
}

// The n-th change of the invoice, minute n after midnight (Central) on Nov 14: odd rows are
// the invoice's own, even rows a line's, so the history mixes both.
function invoiceRow(n: number): AuditLogRow {
    const at: [number, number] = [Math.floor(n / 60), n % 60]
    if (n % 2 === 1) {
        return row({
            n,
            day: '2026-11-14',
            at,
            event: 'changed',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Invoice 1001',
            changes: { memo: { before: `memo ${n - 1}`, after: `memo ${n}` } },
        })
    }
    return row({
        n,
        day: '2026-11-14',
        at,
        event: 'changed',
        type: 'books_invoice_lines',
        record: `bkinvline${String(n).padStart(6, '0')}`,
        label: 'Invoice 1001: line 1',
        parent: INVOICE_PARENT,
        changes: { quantity: { before: n - 1, after: n } },
    })
}

// Another invoice's own row and one of its lines' rows, both newer than every row above.
const OTHER_ROWS = [
    row({
        n: 900,
        day: '2026-11-14',
        at: [20, 0],
        event: 'changed',
        type: 'books_invoices',
        record: OTHER_INVOICE,
        label: 'Invoice 1002',
        changes: { memo: { before: '', after: 'other' } },
    }),
    row({
        n: 901,
        day: '2026-11-14',
        at: [20, 1],
        event: 'added',
        type: 'books_invoice_lines',
        record: 'bkinvline900001',
        label: 'Invoice 1002: line 1',
        parent: { type: 'books_invoices', id: OTHER_INVOICE },
    }),
]

function ids(events: readonly { id: string }[]) {
    return events.map(event => event.id)
}

function idOf(n: number) {
    return invoiceRow(n).id
}

// A ready collection holding the live record rows.
function liveRecords(rows: { id: string }[]) {
    return createCollection(
        localOnlyCollectionOptions({
            id: `books_invoices-live-${Math.random()}`,
            getKey: (record: { id: string }) => record.id,
            initialData: rows,
        })
    )
}

// A collection whose first read waits for the returned release().
function heldRecords() {
    const held: { release: () => void } = { release: () => {} }
    const collection = createCollection({
        id: `books_invoices-held-${Math.random()}`,
        getKey: (record: { id: string }) => record.id,
        sync: {
            sync: ({ begin, commit, markReady }) => {
                held.release = () => {
                    begin()
                    commit()
                    markReady()
                }
            },
        },
    })
    return { collection, release: () => held.release() }
}

// The audit log loaded on demand, as pbtsdb loads it: each subset load gets the window it
// names (newest first, from its offset, up to its limit). After holdLoads(), a load waits
// for release(), so a test can see the screen while a larger window is read.
function heldWindowAuditLog(rows: AuditLogRow[]) {
    const newestFirst = [...rows].sort((a, b) =>
        a.created === b.created ? b.id.localeCompare(a.id) : b.created.localeCompare(a.created)
    )
    const written = new Set<string>()
    const gate = { isHeld: false, waiting: [] as (() => void)[] }
    const collection = createCollection({
        id: `books_audit_log-held-window-${Math.random()}`,
        getKey: (record: AuditLogRow) => record.id,
        autoIndex: 'eager',
        defaultIndexType: BasicIndex,
        syncMode: 'on-demand',
        sync: {
            sync: ({ begin, write, commit, markReady }) => {
                markReady()
                return {
                    loadSubset: async options => {
                        if (gate.isHeld) {
                            await new Promise<void>(resolve => gate.waiting.push(resolve))
                        }
                        const from = options.offset ?? 0
                        const to = options.limit === undefined ? undefined : from + options.limit
                        begin()
                        for (const value of newestFirst.slice(from, to)) {
                            if (written.has(value.id)) continue
                            written.add(value.id)
                            write({ type: 'insert', value })
                        }
                        commit()
                    },
                }
            },
        },
    })
    return {
        collection,
        holdLoads: () => {
            gate.isHeld = true
        },
        release: () => {
            gate.isHeld = false
            for (const resolve of gate.waiting.splice(0)) resolve()
        },
    }
}

beforeEach(() => {
    extra.stores = {}
    seedBooks()
})

describe('useRecordHistory', () => {
    it('shows 50 events newest first, then 50 more, and a new change at the top', async () => {
        const own = Array.from({ length: 51 }, (_, i) => invoiceRow(i + 1))
        const auditLog = guardedStore<AuditLogRow>('books_audit_log', [...own, ...OTHER_ROWS])
        extra.stores.books_invoices = liveRecords([{ id: INVOICE }])

        const { result } = renderHook(() => useRecordHistory('books_invoices', INVOICE))

        // Rows 51 down to 2: the newest 50, the invoice's own and its lines'.
        const newest50 = Array.from({ length: 50 }, (_, i) => idOf(51 - i))
        await waitFor(() => expect(ids(result.current.events)).toEqual(newest50))
        expect(result.current.hasMore).toBe(true)

        act(() => result.current.showMore())
        const all51 = Array.from({ length: 51 }, (_, i) => idOf(51 - i))
        await waitFor(() => expect(ids(result.current.events)).toEqual(all51))
        expect(result.current.hasMore).toBe(false)

        // A change saved while the history is open comes first, without showMore.
        const fresh = row({
            n: 52,
            day: '2026-11-14',
            at: [9, 0],
            event: 'posted',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Invoice 1001',
            changes: { status: { before: 'draft', after: 'posted' } },
        })
        await act(async () => {
            await auditLog.insert(fresh).isPersisted.promise
        })
        await waitFor(() => expect(ids(result.current.events)).toEqual([fresh.id, ...all51]))

        // Another invoice's rows, its own and its lines', never reach this history.
        const shown = ids(result.current.events)
        for (const other of OTHER_ROWS) expect(shown).not.toContain(other.id)
    })

    it('keeps the 50 events on screen, not loading, while the next 50 are read', async () => {
        const own = Array.from({ length: 51 }, (_, i) => invoiceRow(i + 1))
        const auditLog = heldWindowAuditLog(own)
        extra.stores.books_audit_log = auditLog.collection
        extra.stores.books_invoices = liveRecords([{ id: INVOICE }])

        const { result } = renderHook(() => useRecordHistory('books_invoices', INVOICE))

        const newest50 = Array.from({ length: 50 }, (_, i) => idOf(51 - i))
        await waitFor(() => expect(ids(result.current.events)).toEqual(newest50))
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        auditLog.holdLoads()
        act(() => result.current.showMore())
        // The larger window's read is held: the screen keeps what it had.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        expect(ids(result.current.events)).toEqual(newest50)
        expect(result.current.isLoading).toBe(false)

        act(() => auditLog.release())
        const all51 = Array.from({ length: 51 }, (_, i) => idOf(51 - i))
        await waitFor(() => expect(ids(result.current.events)).toEqual(all51))
        expect(result.current.isLoading).toBe(false)
        expect(result.current.hasMore).toBe(false)
    })

    it('names the deleted record by the day of its own newest Deleted row', async () => {
        const added = row({
            n: 1,
            day: '2026-11-10',
            at: [9, 0],
            event: 'added',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Draft invoice',
        })
        const posted = row({
            n: 2,
            day: '2026-11-11',
            at: [9, 0],
            event: 'posted',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Invoice 1001',
            changes: { status: { before: 'draft', after: 'posted' } },
        })
        // Noon UTC, so the day is Nov 13 in any reader's zone.
        const deleted = row({
            n: 3,
            day: '2026-11-13',
            at: [6, 0],
            event: 'deleted',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Invoice 1001',
            snapshot: { status: 'void', number: '1001' },
        })
        // A line deleted later is the line's event, not the invoice's deletion.
        const lineDeleted = row({
            n: 4,
            day: '2026-11-14',
            at: [6, 0],
            event: 'deleted',
            type: 'books_invoice_lines',
            record: 'bkinvline000001',
            label: 'Invoice 1001: line 1',
            parent: INVOICE_PARENT,
            snapshot: { invoice: INVOICE, position: 0 },
        })
        guardedStore<AuditLogRow>('books_audit_log', [added, posted, deleted, lineDeleted])
        extra.stores.books_invoices = liveRecords([])

        const { result } = renderHook(() => useRecordHistory('books_invoices', INVOICE))

        await waitFor(() => expect(result.current.header.deletedOn).toBe(deleted.created))
        expect(result.current.header.openHref).toBeNull()
        expect(result.current.header.title).toBe('Invoice 1001')
        expect(result.current.header.typeWords).toBe('Invoice')
        expect(ids(result.current.events)).toEqual([
            lineDeleted.id,
            deleted.id,
            posted.id,
            added.id,
        ])
    })

    it('shows neither Open nor the deleted line while the live record’s read is held', async () => {
        const deleted = row({
            n: 1,
            day: '2026-11-13',
            at: [6, 0],
            event: 'deleted',
            type: 'books_invoices',
            record: INVOICE,
            label: 'Invoice 1001',
            snapshot: { status: 'void' },
        })
        guardedStore<AuditLogRow>('books_audit_log', [deleted])
        const held = heldRecords()
        extra.stores.books_invoices = held.collection

        const { result } = renderHook(() => useRecordHistory('books_invoices', INVOICE))

        await waitFor(() => expect(ids(result.current.events)).toEqual([deleted.id]))
        expect(result.current.isLoading).toBe(true)
        expect(result.current.header.deletedOn).toBeNull()
        expect(result.current.header.openHref).toBeNull()

        // The read answers with no record: now it is known to be deleted.
        act(() => held.release())
        await waitFor(() => expect(result.current.header.deletedOn).toBe(deleted.created))
        expect(result.current.isLoading).toBe(false)
    })

    // A relation's name is read by the history's FieldValue (components/history), which
    // reports a failed read to the history's key; the hook's readsFailed and retry() are
    // what the history shows and runs. The real FieldValue renders beside the hook.
    it('reports a refused relation read as readsFailed, and retry() reads it again and clears it', async () => {
        seedBooks({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const changed = invoiceRow(1)
        guardedStore<AuditLogRow>('books_audit_log', [changed])
        extra.stores.books_invoices = liveRecords([{ id: INVOICE }])
        const incomeAccount = auditFieldsOf('books_products').income_account
        if (!incomeAccount) throw new Error('books_products has no income_account field')
        const history = historyKey('books_invoices', INVOICE)
        const wrapper = ({ children }: { children: ReactNode }) => (
            <>
                {children}
                <FieldValue
                    field={incomeAccount}
                    value="acct_bank_0001"
                    currency="USD"
                    history={history}
                />
            </>
        )

        const { result } = renderHook(() => useRecordHistory('books_invoices', INVOICE), {
            wrapper,
        })

        await waitFor(() => expect(result.current.readsFailed).toBe(true))
        // Only a value's read failed: the events stay, with no history-wide error.
        expect(result.current.isError).toBe(false)
        expect(ids(result.current.events)).toEqual([changed.id])

        act(() => result.current.retry())

        await waitFor(() => expect(result.current.readsFailed).toBe(false))
        expect(accountsStore().get('acct_bank_0001')).toBeDefined()
        expect(ids(result.current.events)).toEqual([changed.id])
    })
})
