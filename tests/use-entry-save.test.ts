// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntrySave } from '../tinycld/books/hooks/useEntrySave'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import type { EntryFormLine } from '../tinycld/books/lib/entry-lines'
import type { EntryFormValues } from '../tinycld/books/lib/entry-schema'
import type { BooksJournalEntries, BooksJournalLines } from '../tinycld/books/types'
import {
    enteredWrites,
    entryStore,
    holdWrites,
    liftRefusal,
    lineStore,
    messageRefusal,
    refuseAfterMore,
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The save sequence is an ordered write (entry, then lines in order, then status).
// The collections are the real local-only ones from the harness; nothing of ours is mocked.

const CASH = 'acct_bank_0001'
const EQUITY = 'acct_equity_0001'

const line = (over: Partial<EntryFormLine> = {}): EntryFormLine => ({
    id: '',
    account: '',
    debit: '',
    credit: '',
    memo: '',
    ...over,
})

const debit = (over: Partial<EntryFormLine> = {}) =>
    line({ account: CASH, debit: '10.00', ...over })
const credit = (over: Partial<EntryFormLine> = {}) =>
    line({ account: EQUITY, credit: '10.00', ...over })

function values(lines: EntryFormLine[], over: Partial<EntryFormValues> = {}): EntryFormValues {
    return { date: '2026-10-12', memo: 'Opening', autoReverseOn: '', lines, ...over }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

type Props = {
    entryId: string | null
    saved: readonly EntryFormLine[]
    replaces?: string
    currency?: string
}

function renderSave(initialProps: Props = { entryId: null, saved: [], currency: 'USD' }) {
    return renderHook((props: Props) => useEntrySave({ currency: 'USD', ...props }), {
        wrapper,
        initialProps,
    })
}

function entries() {
    return entryStore().toArray
}

function lines() {
    return [...lineStore().toArray].sort((a, b) => a.position - b.position)
}

const NOW = '2026-10-01 00:00:00.000Z'

const savedEntry: BooksJournalEntries = {
    id: 'je_draft',
    doc_type: 'journal',
    status: 'draft',
    origin: 'manual',
    number: '',
    sequence: 0,
    date: '2026-10-12',
    memo: 'Existing draft',
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

function savedLine(id: string, position: number, over: Partial<BooksJournalLines>) {
    return {
        id,
        entry: 'je_draft',
        account: CASH,
        debit: 0,
        credit: 0,
        memo: '',
        position,
        posted: false,
        date: '2026-10-12',
        currency: 'USD',
        created: NOW,
        updated: NOW,
        ...over,
    } satisfies BooksJournalLines
}

const SAVED_ROWS = [
    savedLine('l1', 0, { account: CASH, debit: 1000 }),
    savedLine('l2', 1, { account: EQUITY, credit: 800, memo: 'old memo' }),
    savedLine('l3', 2, { account: EQUITY, credit: 200 }),
]

const SAVED_FORM: EntryFormLine[] = [
    line({ id: 'l1', account: CASH, debit: '10.00' }),
    line({ id: 'l2', account: EQUITY, credit: '8.00', memo: 'old memo' }),
    line({ id: 'l3', account: EQUITY, credit: '2.00' }),
]

beforeEach(() => {
    seedBooks({ ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] } })
})

describe('useEntrySave: new entry', () => {
    it('writes the draft entry before any line, then lines at their non-blank index', async () => {
        const hook = renderSave()
        let id = ''
        await act(async () => {
            id = await hook.result.current.saveDraft(
                values([debit({ memo: 'first' }), line(), credit()])
            )
        })

        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({
            id,
            status: 'draft',
            origin: 'manual',
            doc_type: 'journal',
            date: '2026-10-12',
            memo: 'Opening',
        })
        expect(enteredWrites()[0]).toBe(id)
        expect(enteredWrites()).toHaveLength(3)

        const written = lines()
        expect(written).toHaveLength(2)
        expect(written.map(l => l.position)).toEqual([0, 1])
        expect(written.map(l => l.entry)).toEqual([id, id])
        expect(written.map(l => l.account)).toEqual([CASH, EQUITY])
        expect(written.map(l => [l.debit, l.credit])).toEqual([
            [1000, 0],
            [0, 1000],
        ])
        expect(written[0].memo).toBe('first')
    })

    it('post writes status posted only after every line is written', async () => {
        const hook = renderSave()
        let id = ''
        await act(async () => {
            id = await hook.result.current.post(values([debit(), credit()]))
        })

        const order = enteredWrites()
        expect(order).toHaveLength(4)
        expect(order[0]).toBe(id)
        expect(order.slice(1, 3)).not.toContain(id)
        expect(order[3]).toBe(id)
        expect(entries()).toHaveLength(1)
        expect(entries()[0].status).toBe('posted')
        expect(lines()).toHaveLength(2)
    })

    it('passes replaces to the new entry', async () => {
        const hook = renderSave({ entryId: null, saved: [], replaces: 'je_old' })
        await act(async () => {
            await hook.result.current.saveDraft(values([debit(), credit()]))
        })
        expect(entries()[0].replaces).toBe('je_old')
    })

    it('reports isPending while a write is held', async () => {
        const release = holdWrites()
        const hook = renderSave()
        let saving: Promise<string> = Promise.resolve('')
        act(() => {
            saving = hook.result.current.saveDraft(values([debit(), credit()]))
        })
        await waitFor(() => expect(hook.result.current.isPending).toBe(true))
        release()
        await act(async () => {
            await saving
        })
        await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    })
})

describe('useEntrySave: existing draft', () => {
    beforeEach(() => {
        seedBooks({
            ledger: {
                lines: SAVED_ROWS,
                entries: [savedEntry],
                balances: [],
                settings: [SETTINGS],
            },
        })
    })

    it('inserts only new lines, updates only changed lines and deletes only removed lines', async () => {
        const hook = renderSave({ entryId: 'je_draft', saved: SAVED_FORM })
        const next = [
            SAVED_FORM[0],
            { ...SAVED_FORM[1], memo: 'new memo' },
            line({ account: EQUITY, credit: '2.00', memo: 'added' }),
        ]
        await act(async () => {
            await hook.result.current.saveDraft(values(next, { memo: 'Edited' }))
        })

        const written = enteredWrites()
        expect(written).not.toContain('l1')
        expect(written).toContain('l2')
        expect(written).toContain('l3')
        expect(entries()).toHaveLength(1)
        expect(entries()[0].memo).toBe('Edited')

        const rows = lines()
        expect(rows.map(l => l.id)).not.toContain('l3')
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({ id: 'l1', position: 0 })
        expect(rows[1]).toMatchObject({ id: 'l2', position: 1, memo: 'new memo' })
        expect(rows[2]).toMatchObject({ position: 2, memo: 'added', credit: 200 })
        // header, l2 update, one insert, l3 delete
        expect(written).toHaveLength(4)
    })

    it('writes nothing for the lines when none changed', async () => {
        const hook = renderSave({ entryId: 'je_draft', saved: SAVED_FORM })
        await act(async () => {
            await hook.result.current.saveDraft(values(SAVED_FORM))
        })
        expect(enteredWrites()).not.toContain('l1')
        expect(enteredWrites()).not.toContain('l2')
        expect(enteredWrites()).not.toContain('l3')
        expect(lines()).toHaveLength(3)
    })

    it('post of an existing draft sets status posted last and does not insert an entry', async () => {
        const hook = renderSave({ entryId: 'je_draft', saved: SAVED_FORM })
        await act(async () => {
            await hook.result.current.post(values(SAVED_FORM))
        })
        const order = enteredWrites()
        expect(order[order.length - 1]).toBe('je_draft')
        expect(entries()).toHaveLength(1)
        expect(entries()[0].status).toBe('posted')
    })
})

describe('useEntrySave: refusals', () => {
    it('keeps the first line when the second line insert is refused, and a retry updates the same entry', async () => {
        const message = 'Line 2: account Old is inactive.'
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            // entry and first line pass, the second line is refused
            refuseAfter: { after: 2, error: messageRefusal(message) },
        })
        const hook = renderSave()

        await act(async () => {
            await expect(
                hook.result.current.saveDraft(values([debit(), credit()]))
            ).rejects.toThrow(message)
        })
        expect(entries()).toHaveLength(1)
        expect(lines()).toHaveLength(1)
        expect(lines()[0]).toMatchObject({ position: 0, account: CASH, debit: 1000 })

        const entryId = entries()[0].id
        const firstLine = lines()[0]
        liftRefusal()
        const before = enteredWrites().length
        hook.rerender({
            entryId,
            saved: [line({ id: firstLine.id, account: CASH, debit: '10.00' })],
        })
        await act(async () => {
            const id = await hook.result.current.saveDraft(
                values([line({ id: firstLine.id, account: CASH, debit: '10.00' }), credit()])
            )
            expect(id).toBe(entryId)
        })

        expect(entries()).toHaveLength(1)
        expect(lines()).toHaveLength(2)
        expect(lines().map(l => l.position)).toEqual([0, 1])
        expect(enteredWrites().slice(before)).not.toContain(firstLine.id)
    })

    it('leaves the draft and its lines when the post is refused, and rejects with the message', async () => {
        const message = 'Books are closed through 2026-09-30.'
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            // entry and both lines pass, the status write is refused
            refuseAfter: { after: 3, error: messageRefusal(message) },
        })
        const hook = renderSave()

        await act(async () => {
            await expect(hook.result.current.post(values([debit(), credit()]))).rejects.toThrow(
                message
            )
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0].status).toBe('draft')
        expect(lines()).toHaveLength(2)
    })
})

describe('useEntrySave: double submit', () => {
    it('a second saveDraft while the first is in flight writes one entry and resolves the same id', async () => {
        const release = holdWrites()
        const hook = renderSave()
        const form = values([debit(), credit()])
        let first: Promise<string> = Promise.resolve('')
        let second: Promise<string> = Promise.resolve('')
        act(() => {
            first = hook.result.current.saveDraft(form)
            second = hook.result.current.saveDraft(form)
        })
        release()
        let ids: string[] = []
        await act(async () => {
            ids = await Promise.all([first, second])
        })

        expect(ids[0]).toBe(ids[1])
        expect(entries()).toHaveLength(1)
        expect(lines()).toHaveLength(2)
        expect(enteredWrites().filter(id => id === ids[0])).toHaveLength(1)
    })
})

describe('useEntrySave: post while a draft save is in flight', () => {
    it('ends posted, not as the draft that was already running', async () => {
        const release = holdWrites()
        const hook = renderSave()
        const form = values([debit(), credit()])

        let draft: Promise<string> = Promise.resolve('')
        let post: Promise<string> = Promise.resolve('')
        act(() => {
            draft = hook.result.current.saveDraft(form)
            post = hook.result.current.post(form)
        })
        release()
        let outcome: PromiseSettledResult<string> = { status: 'rejected', reason: null }
        await act(async () => {
            await draft
            outcome = (await Promise.allSettled([post]))[0]
        })

        // A post may wait for the draft and then post, or be refused; it must not resolve as if
        // posted while the entry is still the draft.
        if (outcome.status === 'fulfilled') expect(entries()[0].status).toBe('posted')
    })
})

describe('useEntrySave: retry on the same instance', () => {
    const message = 'Line 2: account Old is inactive.'

    // The form never carries line ids for new lines, so a retry sends them blank again.
    it('reuses the entry and keeps the first line when no rerender happens between attempts', async () => {
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refuseAfter: { after: 2, error: messageRefusal(message) },
        })
        const hook = renderSave()
        const form = values([debit(), credit()])

        await act(async () => {
            await expect(hook.result.current.saveDraft(form)).rejects.toThrow(message)
        })
        const entryId = entries()[0].id
        const firstLineId = lines()[0].id
        liftRefusal()

        let id = ''
        await act(async () => {
            id = await hook.result.current.saveDraft(form)
        })

        expect(id).toBe(entryId)
        expect(entries()).toHaveLength(1)
        expect(lines()).toHaveLength(2)
        expect(lines()[0].id).toBe(firstLineId)
        expect(lines().map(l => l.position)).toEqual([0, 1])
    })

    it('does not delete a line twice when it was removed between attempts and a later write failed', async () => {
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            // entry and the first two lines pass, the third line is refused
            refuseAfter: { after: 3, error: messageRefusal(message) },
        })
        const hook = renderSave()

        await act(async () => {
            await expect(
                hook.result.current.post(values([debit(), credit(), debit({ memo: 'third' })]))
            ).rejects.toThrow(message)
        })
        const removedId = lines()[1].id
        liftRefusal()

        // The second attempt drops line 2 and gets as far as the status write, which is
        // refused (an unchanged header writes nothing, so the delete is the first write).
        const only = values([debit()])
        refuseAfterMore(1, messageRefusal('Books are closed.'))
        await act(async () => {
            await expect(hook.result.current.post(only)).rejects.toThrow('Books are closed.')
        })
        expect(lines().map(l => l.id)).not.toContain(removedId)
        liftRefusal()

        const before = enteredWrites().length
        await act(async () => {
            await hook.result.current.post(only)
        })
        expect(enteredWrites().slice(before)).not.toContain(removedId)
        expect(entries()).toHaveLength(1)
        expect(entries()[0].status).toBe('posted')
        expect(lines()).toHaveLength(1)
    })
})

describe('useEntrySave: existing draft, partial failure', () => {
    it('a retry with the same stale saved prop updates the line it inserted instead of inserting it again', async () => {
        const message = 'Line 3: account Old is inactive.'
        seedBooks({
            ledger: {
                lines: SAVED_ROWS,
                entries: [savedEntry],
                balances: [],
                settings: [SETTINGS],
            },
            // header update and the first inserted line pass, the second insert is refused
            refuseAfter: { after: 2, error: messageRefusal(message) },
        })
        const hook = renderSave({ entryId: 'je_draft', saved: SAVED_FORM })
        const next = values([
            SAVED_FORM[0],
            line({ account: EQUITY, credit: '4.00', memo: 'A' }),
            line({ account: EQUITY, credit: '6.00', memo: 'B' }),
        ])

        await act(async () => {
            await expect(hook.result.current.saveDraft(next)).rejects.toThrow(message)
        })
        const inserted = lines().filter(l => l.memo === 'A')
        expect(inserted).toHaveLength(1)
        liftRefusal()

        await act(async () => {
            await hook.result.current.saveDraft(next)
        })

        const rows = lines()
        expect(rows).toHaveLength(3)
        expect(rows.filter(l => l.memo === 'A').map(l => l.id)).toEqual([inserted[0].id])
        expect(rows.filter(l => l.memo === 'B')).toHaveLength(1)
        expect(rows.map(l => l.position)).toEqual([0, 1, 2])
        expect(rows.map(l => l.id)).not.toContain('l2')
        expect(rows.map(l => l.id)).not.toContain('l3')
    })
})
