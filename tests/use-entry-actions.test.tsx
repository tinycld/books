// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryActions } from '../tinycld/books/hooks/useEntryActions'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import type { BooksJournalEntries, BooksJournalLines } from '../tinycld/books/types'
import {
    enteredWrites,
    entryStore,
    liftRefusal,
    lineStore,
    messageRefusal,
    refuseAfterMore,
    refuseNthWrite,
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// deleteDraft is an ordered write: each saved line of the entry, then the entry. The
// collections are the real local-only ones from the harness; nothing of ours is mocked.

const NOW = '2026-10-01 00:00:00.000Z'

function entryRow(id: string): BooksJournalEntries {
    return {
        id,
        doc_type: 'journal',
        status: 'draft',
        origin: 'manual',
        number: '',
        sequence: 0,
        date: '2026-10-12',
        memo: id,
        total: 0,
        currency: 'USD',
        auto_reverse_on: '',
        posted_at: '',
        posted_by: '',
        voided_at: '',
        voided_by: '',
        created_by: 'u1',
        close_override: '',
        reverses: '',
        replaces: '',
        created: NOW,
        updated: NOW,
    }
}

function lineRow(id: string, entry: string, position: number): BooksJournalLines {
    return {
        id,
        entry,
        account: 'acct_bank_0001',
        debit: 100,
        credit: 0,
        memo: '',
        position,
        posted: false,
        date: '2026-10-12',
        currency: 'USD',
        created: NOW,
        updated: NOW,
    }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function seed(extra: Parameters<typeof seedBooks>[0] = {}) {
    seedBooks({
        ledger: {
            entries: [entryRow('je_a'), entryRow('je_b')],
            lines: [
                lineRow('a1', 'je_a', 0),
                lineRow('a2', 'je_a', 1),
                lineRow('a3', 'je_a', 2),
                lineRow('b1', 'je_b', 0),
            ],
            balances: [],
            settings: [SETTINGS],
        },
        ...extra,
    })
}

async function render(entryId: string) {
    const hook = renderHook(() => useEntryActions(entryId), { wrapper })
    // Lets the live query over the saved lines deliver its rows.
    await act(async () => {})
    return hook
}

const lineIds = () => lineStore().toArray.map(l => l.id)
const entryIds = () => entryStore().toArray.map(e => e.id)
const leftTheScreen = () =>
    [router.replace, router.push, router.back].some(spy => vi.mocked(spy).mock.calls.length > 0)

beforeEach(() => {
    vi.mocked(router.replace).mockClear()
    vi.mocked(router.push).mockClear()
    vi.mocked(router.back).mockClear()
    seed()
})

describe('useEntryActions.deleteDraft', () => {
    it('deletes every saved line of the entry, then the entry, and leaves other entries alone', async () => {
        const hook = await render('je_a')
        await act(async () => {
            await hook.result.current.deleteDraft()
        })

        const order = enteredWrites()
        expect(order).toHaveLength(4)
        expect(order.slice(0, 3).sort()).toEqual(['a1', 'a2', 'a3'])
        expect(order[3]).toBe('je_a')
        expect(lineIds()).toEqual(['b1'])
        expect(entryIds()).toEqual(['je_b'])
        expect(leftTheScreen()).toBe(true)
    })

    it('deletes an entry that has no lines', async () => {
        seedBooks({
            ledger: {
                entries: [entryRow('je_a')],
                lines: [],
                balances: [],
                settings: [SETTINGS],
            },
        })
        const hook = await render('je_a')
        await act(async () => {
            await hook.result.current.deleteDraft()
        })
        expect(enteredWrites()).toEqual(['je_a'])
        expect(entryIds()).toEqual([])
    })

    it('keeps the entry and stays on the screen when the entry delete is refused, and a retry completes', async () => {
        const message = 'Books are closed through 2026-09-30.'
        const hook = await render('je_a')
        // The three line deletes pass; the entry delete is refused.
        refuseAfterMore(3, messageRefusal(message))
        await act(async () => {
            await expect(hook.result.current.deleteDraft()).rejects.toThrow(message)
        })
        expect(lineIds()).toEqual(['b1'])
        expect(entryIds()).toEqual(['je_a', 'je_b'])
        expect(leftTheScreen()).toBe(false)

        liftRefusal()
        const before = enteredWrites().length
        await act(async () => {
            await hook.result.current.deleteDraft()
        })
        expect(enteredWrites().slice(before)).toEqual(['je_a'])
        expect(entryIds()).toEqual(['je_b'])
        expect(leftTheScreen()).toBe(true)
    })

    it('stops at the first refused line delete and leaves the entry', async () => {
        const message = 'Line is locked.'
        const hook = await render('je_a')
        refuseAfterMore(1, messageRefusal(message))
        await act(async () => {
            await expect(hook.result.current.deleteDraft()).rejects.toThrow(message)
        })
        expect(entryIds()).toContain('je_a')
        expect(lineIds().filter(id => id.startsWith('a'))).toHaveLength(2)
        expect(enteredWrites()).not.toContain('je_a')
    })

    it('deletes every line when called before the lines query has delivered its rows', async () => {
        const hook = renderHook(() => useEntryActions('je_a'), { wrapper })
        await act(async () => {
            await hook.result.current.deleteDraft()
        })

        expect(lineIds()).toEqual(['b1'])
        expect(entryIds()).toEqual(['je_b'])
    })
})

// reverse and voidEntry write the entry row itself. The reversal's lines are written by the
// server when the post succeeds, so the local store never gains lines here.

const REASON = 'Books are closed through 2026-09-30.'

function postedEntry(id: string): BooksJournalEntries {
    return { ...entryRow(id), status: 'posted', number: 'JE-1046', sequence: 1046 }
}

function seedPosted() {
    seedBooks({
        ledger: {
            entries: [postedEntry('je_a'), entryRow('je_b')],
            lines: [lineRow('a1', 'je_a', 0), lineRow('a2', 'je_a', 1)],
            balances: [],
            settings: [SETTINGS],
        },
    })
}

const values = { date: '2026-11-01', memo: 'Reversal of JE-1046' }
const row = (id: string) => entryStore().toArray.find(e => e.id === id)

describe('useEntryActions.reverse', () => {
    beforeEach(seedPosted)

    it('inserts a reversal draft with the dialog values and no lines, posts it, and resolves to its id', async () => {
        const hook = await render('je_a')
        let newId = ''
        await act(async () => {
            newId = await hook.result.current.reverse(values)
        })

        expect(newId).not.toBe('')
        expect(newId).not.toBe('je_a')
        expect(enteredWrites()).toEqual([newId, newId])
        const created = row(newId)
        expect(created).toMatchObject({
            origin: 'reversal',
            reverses: 'je_a',
            date: values.date,
            memo: values.memo,
            doc_type: 'journal',
            auto_reverse_on: '',
            status: 'posted',
        })
        expect(lineIds()).toEqual(['a1', 'a2'])
        expect(row('je_a')?.status).toBe('posted')
    })

    it('deletes the reversal draft when the post is refused and rejects with the server message', async () => {
        const hook = await render('je_a')
        // The insert (write 1) passes; the status update to posted (write 2) is refused.
        refuseNthWrite(2, messageRefusal(REASON))
        await act(async () => {
            await expect(hook.result.current.reverse(values)).rejects.toThrow(REASON)
        })

        const order = enteredWrites()
        expect(order).toHaveLength(3)
        expect(new Set(order).size).toBe(1)
        expect(entryIds()).toEqual(['je_a', 'je_b'])
        expect(row('je_a')?.status).toBe('posted')
        expect(leftTheScreen()).toBe(false)
    })

    it('rejects with the original refusal, not the cleanup error, when the draft delete is also refused', async () => {
        const hook = await render('je_a')
        // The insert (write 1) passes; the post (write 2) and the cleanup delete (write 3) are refused.
        refuseNthWrite(2, messageRefusal(REASON))
        refuseNthWrite(3, messageRefusal('Delete is locked.'))
        await act(async () => {
            await expect(hook.result.current.reverse(values)).rejects.toThrow(REASON)
        })
    })

    it('keeps no reversal when the insert itself is refused', async () => {
        const hook = await render('je_a')
        refuseNthWrite(1, messageRefusal(REASON))
        await act(async () => {
            await expect(hook.result.current.reverse(values)).rejects.toThrow(REASON)
        })
        expect(entryIds()).toEqual(['je_a', 'je_b'])
    })
})

describe('useEntryActions.voidEntry', () => {
    beforeEach(seedPosted)

    it('sets the entry status to void and touches nothing else', async () => {
        const hook = await render('je_a')
        await act(async () => {
            await hook.result.current.voidEntry()
        })

        expect(enteredWrites()).toEqual(['je_a'])
        expect(row('je_a')?.status).toBe('void')
        expect(row('je_b')?.status).toBe('draft')
        expect(entryIds()).toEqual(['je_a', 'je_b'])
        expect(lineIds()).toEqual(['a1', 'a2'])
    })

    it('leaves the entry unchanged and rejects with the message when the void is refused', async () => {
        const hook = await render('je_a')
        refuseAfterMore(0, messageRefusal(REASON))
        await act(async () => {
            await expect(hook.result.current.voidEntry()).rejects.toThrow(REASON)
        })
        expect(row('je_a')?.status).toBe('posted')

        liftRefusal()
        await act(async () => {
            await hook.result.current.voidEntry()
        })
        expect(row('je_a')?.status).toBe('void')
    })
})
