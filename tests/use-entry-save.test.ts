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
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/mutations', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/lib/mutations')>()
    const { atomicStub } = await import('./accounts-form-harness')
    return { ...actual, atomic: atomicStub }
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
    customer: '',
    vendor: '',
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
    revision?: number
    saved: readonly EntryFormLine[]
    replaces?: string
    currency?: string
    docType?: BooksJournalEntries['doc_type']
}

function renderSave(initialProps: Props = { entryId: null, saved: [], currency: 'USD' }) {
    // A stored draft of the fixtures is at revision 1; a new entry has none.
    const loaded = (props: Props) => (props.entryId === null ? 0 : 1)
    return renderHook(
        (props: Props) => useEntrySave({ currency: 'USD', revision: loaded(props), ...props }),
        { wrapper, initialProps }
    )
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
    revision: 1,
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
    document: '',
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
        customer: '',
        vendor: '',
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

    it('writes the document type it is given on the new entry', async () => {
        const hook = renderSave({ entryId: null, saved: [], docType: 'transfer' })
        let id = ''
        await act(async () => {
            id = await hook.result.current.saveDraft(values([debit(), credit()]))
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ id, doc_type: 'transfer', origin: 'manual' })
    })

    it('writes doc_type journal when no document type is given', async () => {
        const hook = renderSave({ entryId: null, saved: [] })
        let id = ''
        await act(async () => {
            id = await hook.result.current.saveDraft(values([debit(), credit()]))
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ id, doc_type: 'journal' })
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

describe('useEntrySave: existing draft, saved twice on one mount', () => {
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

    it('the second save writes no insert and no delete for the line the first one added', async () => {
        // The `saved` prop stays as the form was seeded, and the form still sends the
        // added line with a blank id, as it does after a save.
        const hook = renderSave({ entryId: 'je_draft', saved: SAVED_FORM })
        const next = values([
            ...SAVED_FORM,
            line({ account: EQUITY, credit: '1.00', memo: 'added' }),
        ])
        let firstId = ''
        await act(async () => {
            firstId = await hook.result.current.saveDraft(next)
        })
        const idsAfterFirst = lines().map(l => l.id)
        expect(idsAfterFirst).toHaveLength(4)
        const writesAfterFirst = enteredWrites().length

        let secondId = ''
        await act(async () => {
            secondId = await hook.result.current.saveDraft(next)
        })

        expect(secondId).toBe(firstId)
        expect(entries()).toHaveLength(1)
        expect(lines().map(l => l.id)).toEqual(idsAfterFirst)
        const secondWrites = enteredWrites().slice(writesAfterFirst)
        expect(secondWrites.filter(id => !idsAfterFirst.includes(id) && id !== 'je_draft')).toEqual(
            []
        )
        expect(lines().filter(l => l.memo === 'added')).toHaveLength(1)
    })
})

describe('useEntrySave: refusals', () => {
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
        const [outcome] = await act(async () => {
            await draft
            return Promise.allSettled([post])
        })

        // A post may wait for the draft and then post, or be refused; it must not resolve as if
        // posted while the entry is still the draft.
        if (outcome.status === 'fulfilled') expect(entries()[0].status).toBe('posted')
    })
})

// A save is one batch that states the revision the form loaded (server/revision.go).
describe('useEntrySave: one batch and a revision', () => {
    const seedDraft = (refusal?: unknown) =>
        seedBooks({
            ledger: {
                lines: SAVED_ROWS,
                entries: [{ ...savedEntry, revision: 3 }],
                balances: [],
                settings: [SETTINGS],
            },
            refusal,
        })

    it('writes no row of a new entry when the save is refused', async () => {
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refusal: messageRefusal('Line 2: the account is inactive.'),
        })
        const hook = renderSave()
        await act(async () => {
            await expect(
                hook.result.current.saveDraft(values([debit(), credit()]))
            ).rejects.toThrow('inactive')
        })
        expect(entries()).toHaveLength(0)
        expect(lines()).toHaveLength(0)
    })

    it('changes no row of an existing draft when the save is refused', async () => {
        seedDraft(messageRefusal('Line 1: the account is inactive.'))
        const hook = renderSave({ entryId: 'je_draft', revision: 3, saved: SAVED_FORM })
        const changed = [{ ...SAVED_FORM[0], debit: '99.00' }, SAVED_FORM[1], SAVED_FORM[2]]
        await act(async () => {
            await expect(
                hook.result.current.saveDraft(values(changed, { memo: 'changed' }))
            ).rejects.toThrow('inactive')
        })
        expect(entries()[0]).toMatchObject({ memo: 'Existing draft', revision: 3 })
        expect(lines()[0].debit).toBe(1000)
    })

    it('states the revision it loaded, as the next value, with the header and the lines', async () => {
        seedDraft()
        const hook = renderSave({ entryId: 'je_draft', revision: 3, saved: SAVED_FORM })
        const changed = [{ ...SAVED_FORM[0], debit: '12.00' }, SAVED_FORM[1], SAVED_FORM[2]]
        await act(async () => {
            await hook.result.current.saveDraft(values(changed, { memo: 'changed' }))
        })
        expect(entries()[0]).toMatchObject({ memo: 'changed', revision: 4, status: 'draft' })
        expect(lines()[0].debit).toBe(1200)

        // The next save on the same mount states the revision the first one left.
        await act(async () => {
            await hook.result.current.saveDraft(values(changed, { memo: 'again' }))
        })
        expect(entries()[0]).toMatchObject({ memo: 'again', revision: 5 })
    })

    // The header does not change here, so the batch would hold only lines, which the
    // server does not check: the form must refuse it.
    it('refuses a save of lines when the stored draft moved past the loaded revision', async () => {
        seedDraft()
        const hook = renderSave({ entryId: 'je_draft', revision: 2, saved: SAVED_FORM })
        const changed = [{ ...SAVED_FORM[0], debit: '99.00' }, SAVED_FORM[1], SAVED_FORM[2]]
        await act(async () => {
            await expect(
                hook.result.current.saveDraft(values(changed, { memo: savedEntry.memo }))
            ).rejects.toMatchObject({ status: 409 })
        })
        expect(entries()[0]).toMatchObject({ revision: 3 })
        expect(lines()[0].debit).toBe(1000)
    })

    it('posts an existing draft in its save, with the entry written last', async () => {
        seedDraft()
        const hook = renderSave({ entryId: 'je_draft', revision: 3, saved: SAVED_FORM })
        const changed = [{ ...SAVED_FORM[0], memo: 'new line memo' }, SAVED_FORM[1], SAVED_FORM[2]]
        await act(async () => {
            await hook.result.current.post(values(changed))
        })
        expect(entries()[0]).toMatchObject({ status: 'posted', revision: 4 })
        expect(enteredWrites()).toEqual(['l1', 'je_draft'])
    })

    it('creates a new entry as a draft, then posts it with revision 2', async () => {
        seedBooks({ ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] } })
        const hook = renderSave()
        await act(async () => {
            await hook.result.current.post(values([debit(), credit()]))
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ status: 'posted', revision: 2 })
        expect(lines()).toHaveLength(2)
    })
})

// The create batch succeeded and the post was refused: the form goes on with that
// draft. The next post updates it and creates no second entry.
describe('useEntrySave: a refused post of a new entry', () => {
    it('keeps the draft, and the next post updates and posts that same entry', async () => {
        const message = 'Books are closed through 2026-09-30.'
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            // the create batch (the entry and two lines) passes, the post is refused
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
        liftRefusal()

        await act(async () => {
            await hook.result.current.post(
                values([debit({ debit: '12.00' }), credit({ credit: '12.00' })])
            )
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ status: 'posted', revision: 2 })
        expect(lines().map(l => l.debit + l.credit)).toEqual([1200, 1200])
    })
})
