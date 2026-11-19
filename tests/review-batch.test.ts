// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewBatch } from '../tinycld/books/hooks/useReviewBatch'
import { BANK_BATCH_TRANSPORT_TEXT, type BatchOutcome } from '../tinycld/books/lib/bank-review'
import { useBankingUIStore } from '../tinycld/books/stores/banking-ui-store'
import type { BooksBankMatches, BooksBankTransactions } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    holdWrites,
    messageRefusal,
    refuseAfterNow,
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logSpies = silenceLog()

const CANNOT_CHANGE = 'This transaction cannot be changed.'

function forReviewRows(count: number): BooksBankTransactions[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `txn_${String(i + 1).padStart(3, '0')}`,
        connection: 'bankconncheckng',
        file: 'bankfile_oct_01',
        bank_import: 'bankimport_0001',
        line: i + 2,
        date: '2026-10-27',
        description: `Row ${i + 1}`,
        memo: '',
        amount: -(i + 1) * 100,
        fitid: '',
        check_number: '',
        dedupe_hash: String(i).padStart(64, '0'),
        status: 'for_review',
        created: '2026-11-03 10:00:00.000Z',
        updated: '2026-11-03 10:00:00.000Z',
    }))
}

// Shaped like a fetch that never reached the server: the SDK answers it with status 0.
function unsentError() {
    return Object.assign(new Error('Failed to fetch'), { status: 0, response: {} })
}

let txns: ReturnType<typeof guardedStore<BooksBankTransactions>>

function seedTxns(count: number, refusalFor: Record<string, unknown> = {}) {
    seedBooks({ level: 'bookkeeper', refusalFor })
    const rows = forReviewRows(count)
    txns = guardedStore<BooksBankTransactions>('books_bank_transactions', rows)
    return rows.map(row => row.id)
}

const ALREADY_MATCHED = 'Transfer 9 is already matched to another bank transaction.'

// The match rows the client wrote, by bank transaction. Registered after seedTxns, so the
// inserts go through the shared write handler and its refusals.
function seedMatches() {
    return guardedStore<BooksBankMatches>('books_bank_matches', [])
}

function matchRows(matches: ReturnType<typeof seedMatches>) {
    return matches.toArray
        .map(row => ({ bank_transaction: row.bank_transaction, lines: [...row.lines] }))
        .sort((a, b) => a.bank_transaction.localeCompare(b.bank_transaction))
}

function statusOf(id: string) {
    return txns.get(id)?.status
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
    })
}

function bankingWarnings() {
    return logSpies.warn.mock.calls.filter(call => call[0] === 'books.banking')
}

beforeEach(() => {
    logSpies.warn.mockClear()
    useBankingUIStore.getState().closeAll()
})

describe('useReviewBatch', () => {
    it('excludes every row, at most 50 writes at once', async () => {
        const ids = seedTxns(120)
        const release = holdWrites()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let running: Promise<BatchOutcome> | undefined
        act(() => {
            running = result.current.run({
                kind: 'exclude',
                ids,
                summary: '120 selected',
                origin: 'bar',
            })
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(50))
        await settle()
        expect(enteredWrites()).toEqual(ids.slice(0, 50))
        expect(result.current.isPending).toBe(true)
        expect(result.current.pending).toEqual({
            kind: 'exclude',
            ids,
            summary: '120 selected',
            origin: 'bar',
        })

        release()
        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await running
        })
        expect(outcome?.failed).toEqual([])
        expect([...(outcome?.done ?? [])].sort()).toEqual(ids)
        expect(ids.filter(id => statusOf(id) !== 'excluded')).toEqual([])
        expect(enteredWrites()).toHaveLength(120)
        await waitFor(() => expect(result.current.isPending).toBe(false))
        expect(result.current.pending).toBeNull()
        expect(result.current.result).toEqual({
            text: 'Excluded 120 transactions.',
            tone: 'muted',
        })
        expect(bankingWarnings()).toEqual([])

        act(() => result.current.clearResult())
        await waitFor(() => expect(result.current.result).toBeNull())
    })

    // A tab or account change calls clearResult: it hides the result line but must keep
    // a run in flight pending, so the controls stay disabled until the run ends.
    it('keeps a bar run pending when its result is cleared mid-run', async () => {
        const ids = seedTxns(3)
        const release = holdWrites()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let running: Promise<BatchOutcome> | undefined
        act(() => {
            running = result.current.run({
                kind: 'exclude',
                ids,
                summary: '3 selected',
                origin: 'bar',
            })
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))

        act(() => result.current.clearResult())
        await settle()
        expect(result.current.isPending).toBe(true)
        expect(result.current.pending).toEqual({
            kind: 'exclude',
            ids,
            summary: '3 selected',
            origin: 'bar',
        })

        release()
        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await running
        })
        expect(outcome?.failed).toEqual([])
        expect([...(outcome?.done ?? [])].sort()).toEqual(ids)
        expect(ids.filter(id => statusOf(id) !== 'excluded')).toEqual([])
        await waitFor(() => expect(result.current.isPending).toBe(false))
        expect(result.current.pending).toBeNull()
    })

    it('rolls a refused row back and shows the refusal', async () => {
        // The chunk's writes run in parallel, so the refusal names the row, not a write position.
        const ids = seedTxns(3, { txn_002: messageRefusal(CANNOT_CHANGE) })
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'exclude',
                ids,
                summary: '',
                origin: 'drawer',
            })
        })
        expect([...(outcome?.done ?? [])].sort()).toEqual(['txn_001', 'txn_003'])
        expect(outcome?.failed).toEqual([
            { id: 'txn_002', message: CANNOT_CHANGE, isTransport: false },
        ])
        await waitFor(() => expect(statusOf('txn_002')).toBe('for_review'))
        expect(statusOf('txn_001')).toBe('excluded')
        expect(statusOf('txn_003')).toBe('excluded')
        await waitFor(() =>
            expect(result.current.result).toEqual({ text: CANNOT_CHANGE, tone: 'danger' })
        )
        expect(bankingWarnings()).toEqual([])
    })

    it('counts a row that left the store, with no internal error text', async () => {
        const [kept] = seedTxns(1)
        const gone = 'txn_gone_999'
        expect(txns.get(gone)).toBeUndefined()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'exclude',
                ids: [kept, gone],
                summary: '',
                origin: 'drawer',
            })
        })
        expect(outcome?.done).toEqual([kept])
        expect(outcome?.failed).toEqual([{ id: gone, message: '', isTransport: false }])
        await waitFor(() =>
            expect(result.current.result).toEqual({
                text: '1 of 2 transactions could not be excluded. Try again.',
                tone: 'danger',
            })
        )
        expect(bankingWarnings()).toEqual([])
    })

    it('inserts one match row for each id, with the lines of that id', async () => {
        const ids = seedTxns(2)
        const matches = seedMatches()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids,
                summary: '2 selected',
                origin: 'bar',
                matchLines: { txn_001: ['line_a'], txn_002: ['line_b', 'line_c'] },
            })
        })
        expect(outcome?.failed).toEqual([])
        expect([...(outcome?.done ?? [])].sort()).toEqual(ids)
        expect(matchRows(matches)).toEqual([
            { bank_transaction: 'txn_001', lines: ['line_a'] },
            { bank_transaction: 'txn_002', lines: ['line_b', 'line_c'] },
        ])
        expect(new Set(matches.toArray.map(row => row.id)).size).toBe(2)
        // The server moves a matched transaction to Reviewed; the client writes no status.
        expect(statusOf('txn_001')).toBe('for_review')
        expect(statusOf('txn_002')).toBe('for_review')
        await waitFor(() =>
            expect(result.current.result).toEqual({
                text: 'Matched 2 transactions.',
                tone: 'muted',
            })
        )
        expect(bankingWarnings()).toEqual([])
    })

    it('counts an id with no lines as a failure with no message, and sends nothing for it', async () => {
        const ids = seedTxns(2)
        const matches = seedMatches()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids,
                summary: '',
                origin: 'bar',
                matchLines: { txn_001: ['line_a'] },
            })
        })
        expect(outcome?.done).toEqual(['txn_001'])
        expect(outcome?.failed).toEqual([{ id: 'txn_002', message: '', isTransport: false }])
        expect(matchRows(matches)).toEqual([{ bank_transaction: 'txn_001', lines: ['line_a'] }])
    })

    it("puts a refused match in failed with the server's message", async () => {
        const [id] = seedTxns(1)
        const matches = seedMatches()
        refuseAfterNow(0, messageRefusal(ALREADY_MATCHED))
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids: [id],
                summary: '1 selected',
                origin: 'bar',
                matchLines: { [id]: ['line_a'] },
            })
        })
        expect(outcome?.done).toEqual([])
        expect(outcome?.failed).toEqual([{ id, message: ALREADY_MATCHED, isTransport: false }])
        // The refused write is the insert of a match row, keyed by its own new id; the bank
        // transaction itself was not written.
        const entered = enteredWrites()
        expect(entered).toHaveLength(1)
        expect(entered).not.toContain(id)
        expect(statusOf(id)).toBe('for_review')
        await waitFor(() => expect(matches.toArray).toEqual([]))
        await waitFor(() =>
            expect(result.current.result).toEqual({ text: ALREADY_MATCHED, tone: 'danger' })
        )
    })

    it('gives no result line for a failed match from the drawer, which shows it itself', async () => {
        const [id] = seedTxns(1)
        seedMatches()
        refuseAfterNow(0, messageRefusal(ALREADY_MATCHED))
        // The drawer still shows this transaction when the run settles.
        useBankingUIStore.getState().openTxn(id)
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids: [id],
                summary: '',
                origin: 'drawer',
                matchLines: { [id]: ['line_a'] },
            })
        })
        expect(outcome?.failed).toEqual([{ id, message: ALREADY_MATCHED, isTransport: false }])
        await waitFor(() => expect(result.current.isPending).toBe(false))
        await settle()
        expect(result.current.result).toBeNull()
    })

    it.each([
        ['the drawer is closed', null],
        ['the drawer shows another transaction', 'txn_other'],
    ])("shows the server's message for a failed drawer match when %s", async (_, openId) => {
        const [id] = seedTxns(1)
        seedMatches()
        refuseAfterNow(0, messageRefusal(ALREADY_MATCHED))
        const ui = useBankingUIStore.getState()
        if (openId === null) ui.closeTxn()
        else ui.openTxn(openId)
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids: [id],
                summary: '',
                origin: 'drawer',
                matchLines: { [id]: ['line_a'] },
            })
        })
        expect(outcome?.failed).toEqual([{ id, message: ALREADY_MATCHED, isTransport: false }])
        await waitFor(() =>
            expect(result.current.result).toEqual({ text: ALREADY_MATCHED, tone: 'danger' })
        )
    })

    it('gives the matched line for a match from the drawer that went through', async () => {
        const [id] = seedTxns(1)
        const matches = seedMatches()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'match',
                ids: [id],
                summary: '',
                origin: 'drawer',
                matchLines: { [id]: ['line_a', 'line_b'] },
            })
        })
        expect(outcome).toEqual({ done: [id], failed: [] })
        expect(matchRows(matches)).toEqual([{ bank_transaction: id, lines: ['line_a', 'line_b'] }])
        await waitFor(() => expect(result.current.result?.text).toBe('Matched 1 transaction.'))
        expect(result.current.result?.tone).toBe('muted')
    })

    it('shows the transport text and warns once when nothing reached the server', async () => {
        const ids = seedTxns(3)
        refuseAfterNow(0, unsentError())
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({
                kind: 'exclude',
                ids,
                summary: '',
                origin: 'drawer',
            })
        })
        expect(outcome?.done).toEqual([])
        expect(outcome?.failed.map(f => f.id).sort()).toEqual(ids)
        expect(outcome?.failed.every(f => f.isTransport)).toBe(true)
        await waitFor(() => expect(ids.filter(id => statusOf(id) !== 'for_review')).toEqual([]))
        await waitFor(() =>
            expect(result.current.result).toEqual({
                text: BANK_BATCH_TRANSPORT_TEXT,
                tone: 'danger',
            })
        )
        expect(bankingWarnings()).toEqual([
            [
                'books.banking',
                'bank transaction status change not sent',
                expect.objectContaining({ kind: 'exclude' }),
            ],
        ])
    })
})
