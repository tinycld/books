// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTransferDetail } from '../tinycld/books/hooks/useTransferDetail'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import {
    TRANSFER_ACCOUNTS,
    TRANSFER_IDS,
    TRANSFER_LINES,
    TRANSFERS,
} from '../tinycld/books/lib/transfer-fixture'
import type { BooksJournalEntries } from '../tinycld/books/types'
import { cleanups, entryStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The real hook over the harness's collections. Journal entries load on demand, as pbtsdb
// loads them, so the read of the replaced original is its own subset load that can be
// refused on its own while the correction's read succeeds.
function entryOf(id: string): BooksJournalEntries {
    const entry = TRANSFERS.find(row => row.id === id)
    if (!entry) throw new Error(`No fixture transfer ${id}`)
    return entry
}

// TR-1, posted, and an unposted correction of it (no number yet) with its two lines.
const ORIGINAL: BooksJournalEntries = {
    ...entryOf(TRANSFER_IDS.original),
    status: 'posted',
    voided_at: '',
    voided_by: '',
}
const CORRECTION: BooksJournalEntries = {
    ...entryOf(TRANSFER_IDS.correction),
    status: 'draft',
    number: '',
    sequence: 0,
    posted_at: '',
    posted_by: '',
    replaces: ORIGINAL.id,
}
const CORRECTION_LINES = TRANSFER_LINES[TRANSFER_IDS.correction].map(line => ({
    ...line,
    posted: false,
    date: '',
}))

function seed(opts: { entriesReadFailsOnceFor?: string } = {}) {
    seedBooks({
        ledger: {
            accounts: TRANSFER_ACCOUNTS,
            balances: [],
            lines: CORRECTION_LINES,
            entries: [ORIGINAL, CORRECTION],
            settings: [SETTINGS],
        },
        entriesOnDemand: true,
        entriesReadFailsOnceFor: opts.entriesReadFailsOnceFor,
    })
}

type Seen = { viewState: string; replacesNumber: string | undefined }

// Every render's state and replaced number, so a test can prove a pair never showed.
function renderDetail(entryId: string) {
    const seen: Seen[] = []
    const hook = renderHook(() => {
        const detail = useTransferDetail(entryId)
        seen.push({ viewState: detail.viewState, replacesNumber: detail.replacesNumber })
        return detail
    })
    return { hook, seen }
}

function readyWithoutNumber(seen: Seen[]) {
    return seen.filter(pair => pair.viewState === 'ready' && pair.replacesNumber === undefined)
}

describe('useTransferDetail: the replaced original', () => {
    it('shows a refused read of the original as an error, never ready without its number, and Retry recovers it', async () => {
        seed({ entriesReadFailsOnceFor: ORIGINAL.id })
        expectLiveQueryError(entryStore().id)
        const { hook, seen } = renderDetail(CORRECTION.id)

        await waitFor(() => expect(hook.result.current.viewState).toBe('error'))
        expect(readyWithoutNumber(seen)).toEqual([])

        act(() => hook.result.current.onRetry())

        await waitFor(() => expect(hook.result.current.viewState).toBe('ready'))
        expect(hook.result.current.replacesNumber).toBe('TR-1')
        expect(hook.result.current.entry?.id).toBe(CORRECTION.id)
        expect(readyWithoutNumber(seen)).toEqual([])
        // The source never failed, so Retry rebuilt the failed query and cleaned no source.
        expect(cleanups()).toEqual([])
    })

    it('is ready with the original number once loaded, and never ready without it on the way', async () => {
        seed()
        const { hook, seen } = renderDetail(CORRECTION.id)

        await waitFor(() => expect(hook.result.current.viewState).toBe('ready'))
        expect(hook.result.current.replacesNumber).toBe('TR-1')
        expect(readyWithoutNumber(seen)).toEqual([])
    })

    it('is ready with no replaced number for a transfer that replaces nothing', async () => {
        seed()
        const { hook } = renderDetail(ORIGINAL.id)

        await waitFor(() => expect(hook.result.current.viewState).toBe('ready'))
        expect(hook.result.current.entry?.id).toBe(ORIGINAL.id)
        expect(hook.result.current.replacesNumber).toBeUndefined()
    })
})
