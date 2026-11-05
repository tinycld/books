// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useFormState } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransferForm } from '../tinycld/books/hooks/useTransferForm'
import { useTransferSubmit } from '../tinycld/books/hooks/useTransferSubmit'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import type { TransferFormValues } from '../tinycld/books/lib/transfer'
import { useTransferPostStore } from '../tinycld/books/stores/transfer-post-store'
import {
    enteredWrites,
    entryStore,
    holdWrites,
    liftRefusal,
    lineStore,
    messageRefusal,
    seedBooks,
    serverRefusal,
    stepWrites,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The real form, the real submit and the real save run together over the harness's
// local-only collections; only the router callbacks are spies. The harness's `writeLog`
// records account, settings and sequence writes only, so the order of entry and line
// writes is read from `enteredWrites` (every key that reached a write handler, in order).
const FROM = 'acct_bank_0001'
const TO = 'acct_equity_0001'
const CLOSED =
    'The books are closed through 2026-06-30. Ask a Books admin for a close-date override.'

const initial: TransferFormValues = {
    from: FROM,
    to: TO,
    amount: '10.00',
    date: '2026-11-04',
    memo: 'Move cash to equity',
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

function renderSubmit(props: { replaces?: string } = {}) {
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    const hook = renderHook(
        () => {
            const transferForm = useTransferForm({ initial, currency: 'USD' })
            const submit = useTransferSubmit({
                transferForm,
                currency: 'USD',
                replaces: props.replaces,
                onSaved,
                onCancel,
            })
            // Read from the latest render, not from a stale formState snapshot.
            const { errors, isSubmitted } = useFormState({ control: transferForm.form.control })
            return { transferForm, submit, errors, isSubmitted }
        },
        { wrapper }
    )
    return { hook, onSaved, onCancel }
}

function entries() {
    return entryStore().toArray
}

function lines() {
    return [...lineStore().toArray].sort((a, b) => a.position - b.position)
}

beforeEach(() => {
    seedBooks({ ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] } })
    useTransferPostStore.setState({ isPostPending: false })
})

describe('useTransferSubmit: post', () => {
    it('writes the draft transfer entry, the From credit line, the To debit line, then the posted status', async () => {
        const steps = stepWrites()
        const { hook, onSaved } = renderSubmit()

        let posting: Promise<void> = Promise.resolve()
        act(() => {
            posting = hook.result.current.submit.post()
        })

        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        const id = enteredWrites()[0]
        expect(entryStore().get(id)).toMatchObject({
            doc_type: 'transfer',
            origin: 'manual',
            status: 'draft',
            replaces: '',
        })

        act(() => steps.next())
        await waitFor(() => expect(enteredWrites()).toHaveLength(2))
        expect(lineStore().get(enteredWrites()[1])).toMatchObject({
            entry: id,
            position: 0,
            account: FROM,
            debit: 0,
            credit: 1000,
        })

        act(() => steps.next())
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        expect(lineStore().get(enteredWrites()[2])).toMatchObject({
            entry: id,
            position: 1,
            account: TO,
            debit: 1000,
            credit: 0,
        })

        act(() => steps.next())
        await waitFor(() => expect(enteredWrites()).toHaveLength(4))
        expect(enteredWrites()[3]).toBe(id)
        expect(entryStore().get(id)?.status).toBe('posted')

        steps.stop()
        await act(async () => {
            await posting
        })

        expect(entries()).toHaveLength(1)
        expect(entries()[0].status).toBe('posted')
        expect(lines()).toHaveLength(2)
        expect(onSaved).toHaveBeenCalledTimes(1)
        expect(onSaved).toHaveBeenCalledWith(id, 'post')
    })

    it('writes replaces on the new entry when it corrects a posted transfer', async () => {
        const { hook } = renderSubmit({ replaces: 'tr_posted_3' })
        await act(async () => {
            await hook.result.current.submit.saveDraft()
        })
        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ doc_type: 'transfer', replaces: 'tr_posted_3' })
    })

    it('a second post while one is running writes the transfer once', async () => {
        const release = holdWrites()
        const { hook, onSaved } = renderSubmit()

        let first: Promise<void> = Promise.resolve()
        let second: Promise<void> = Promise.resolve()
        act(() => {
            first = hook.result.current.submit.post()
            second = hook.result.current.submit.post()
        })
        release()
        await act(async () => {
            await Promise.all([first, second])
        })

        expect(entries()).toHaveLength(1)
        expect(lines()).toHaveLength(2)
        expect(onSaved).toHaveBeenCalledTimes(1)
    })
})

describe('useTransferSubmit: the post hold', () => {
    it('holds isPostPending through a post and clears it once the post settles', async () => {
        const release = holdWrites()
        const { hook } = renderSubmit()

        let posting: Promise<void> = Promise.resolve()
        act(() => {
            posting = hook.result.current.submit.post()
        })
        // Set before the mutation, so the optimistic `posted` render still sees it.
        expect(useTransferPostStore.getState().isPostPending).toBe(true)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        expect(useTransferPostStore.getState().isPostPending).toBe(true)

        release()
        await act(async () => {
            await posting
        })
        expect(entries()[0].status).toBe('posted')
        expect(useTransferPostStore.getState().isPostPending).toBe(false)
    })

    it('never sets isPostPending for Save draft', async () => {
        const release = holdWrites()
        const { hook } = renderSubmit()

        let saving: Promise<void> = Promise.resolve()
        act(() => {
            saving = hook.result.current.submit.saveDraft()
        })
        expect(useTransferPostStore.getState().isPostPending).toBe(false)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        expect(useTransferPostStore.getState().isPostPending).toBe(false)

        release()
        await act(async () => {
            await saving
        })
        expect(entries()[0].status).toBe('draft')
        expect(useTransferPostStore.getState().isPostPending).toBe(false)
    })
})

describe('useTransferSubmit: refusals', () => {
    it('keeps the written draft and the typed values after a refused post, and the next post updates that draft', async () => {
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refuseAfter: { after: 3, error: messageRefusal(CLOSED) },
        })
        const { hook, onSaved } = renderSubmit()

        await act(async () => {
            await hook.result.current.submit.post()
        })

        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ doc_type: 'transfer', status: 'draft' })
        const entryId = entries()[0].id
        expect(lines()).toHaveLength(2)
        const lineIds = lines().map(line => line.id)
        expect(onSaved).not.toHaveBeenCalled()
        expect(hook.result.current.errors.root?.message).toBe(CLOSED)
        expect(hook.result.current.isSubmitted).toBe(true)
        expect(hook.result.current.transferForm.form.getValues()).toEqual(initial)
        expect(useTransferPostStore.getState().isPostPending).toBe(false)

        liftRefusal()
        const before = enteredWrites().length
        await act(async () => {
            await hook.result.current.submit.post()
        })

        expect(entries()).toHaveLength(1)
        expect(entries()[0]).toMatchObject({ id: entryId, status: 'posted' })
        expect(lines().map(line => line.id)).toEqual(lineIds)
        const again = enteredWrites().slice(before)
        expect(again).toContain(entryId)
        expect(again.every(key => key === entryId || lineIds.includes(key))).toBe(true)
        expect(onSaved).toHaveBeenCalledTimes(1)
        expect(onSaved).toHaveBeenCalledWith(entryId, 'post')
    })

    it('puts a refused memo under the Memo field and only the unplaced field messages in the summary', async () => {
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refuseAfter: { after: 0, error: serverRefusal('memo', 'Memo is too long.') },
        })
        const { hook, onSaved } = renderSubmit()
        await act(async () => {
            await hook.result.current.submit.saveDraft()
        })
        expect(hook.result.current.errors.memo?.message).toBe('Memo is too long.')
        expect(hook.result.current.errors.root).toBeUndefined()
        expect(onSaved).not.toHaveBeenCalled()
        hook.unmount()

        // A refusal whose field map mixes a placed key with an unplaced one. The memo text
        // must show once, under Memo; the summary holds only the message no field can show,
        // not the whole refusal written out with column names.
        const mixed = Object.assign(new Error('Failed to create record.'), {
            response: {
                data: {
                    memo: { message: 'Memo is too long.' },
                    total: { message: 'Total is too large.' },
                },
            },
        })
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refuseAfter: { after: 0, error: mixed },
        })
        const other = renderSubmit()
        await act(async () => {
            await other.hook.result.current.submit.saveDraft()
        })
        expect(other.hook.result.current.errors.memo?.message).toBe('Memo is too long.')
        expect(other.hook.result.current.errors.root?.message).toBe('Total is too large.')
        expect(other.hook.result.current.errors.root?.message).not.toContain('Memo is too long.')
        expect(other.onSaved).not.toHaveBeenCalled()
    })
})

describe('useTransferSubmit: leaving', () => {
    it('leaves at once without edits, asks after an edit, and leaves on discard', () => {
        const { hook, onCancel } = renderSubmit()

        act(() => hook.result.current.submit.cancel())
        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(hook.result.current.submit.isDiscardOpen).toBe(false)

        act(() => {
            hook.result.current.transferForm.form.setValue('memo', 'Changed memo', {
                shouldDirty: true,
            })
        })
        act(() => hook.result.current.submit.cancel())
        expect(hook.result.current.submit.isDiscardOpen).toBe(true)
        expect(onCancel).toHaveBeenCalledTimes(1)

        act(() => hook.result.current.submit.discard())
        expect(onCancel).toHaveBeenCalledTimes(2)
        expect(hook.result.current.submit.isDiscardOpen).toBe(false)
    })
})
