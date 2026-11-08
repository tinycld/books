// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewBatch } from '../tinycld/books/hooks/useReviewBatch'
import { BANK_BATCH_TRANSPORT_TEXT, type BatchOutcome } from '../tinycld/books/lib/bank-review'
import type { BooksBankTransactions } from '../tinycld/books/types'
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
})

describe('useReviewBatch', () => {
    it('excludes every row, at most 50 writes at once', async () => {
        const ids = seedTxns(120)
        const release = holdWrites()
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let running: Promise<BatchOutcome> | undefined
        act(() => {
            running = result.current.run({ kind: 'exclude', ids, summary: '120 selected' })
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(50))
        await settle()
        expect(enteredWrites()).toEqual(ids.slice(0, 50))
        expect(result.current.isPending).toBe(true)
        expect(result.current.pending).toEqual({
            kind: 'exclude',
            ids,
            summary: '120 selected',
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

    it('rolls a refused row back and shows the refusal', async () => {
        // The chunk's writes run in parallel, so the refusal names the row, not a write position.
        const ids = seedTxns(3, { txn_002: messageRefusal(CANNOT_CHANGE) })
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({ kind: 'exclude', ids, summary: '' })
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
            outcome = await result.current.run({ kind: 'exclude', ids: [kept, gone], summary: '' })
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

    it('shows the transport text and warns once when nothing reached the server', async () => {
        const ids = seedTxns(3)
        refuseAfterNow(0, unsentError())
        const { result } = renderHook(() => useReviewBatch(), { wrapper })

        let outcome: BatchOutcome | undefined
        await act(async () => {
            outcome = await result.current.run({ kind: 'exclude', ids, summary: '' })
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
