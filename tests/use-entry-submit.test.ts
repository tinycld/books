// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryForm } from '../tinycld/books/hooks/useEntryForm'
import { useEntrySubmit } from '../tinycld/books/hooks/useEntrySubmit'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import type { EntryFormValues } from '../tinycld/books/lib/entry-schema'
import { holdWrites, messageRefusal, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const { warn } = silenceLog()

// The real form and the real save run together; only the router callbacks are spies.
const initial: EntryFormValues = {
    date: '2026-10-12',
    memo: 'Opening',
    autoReverseOn: '',
    lines: [
        { id: '', account: 'acct_bank_0001', debit: '10.00', credit: '', memo: '' },
        { id: '', account: 'acct_equity_0001', debit: '', credit: '10.00', memo: '' },
    ],
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

function renderSubmit() {
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    const hook = renderHook(
        () => {
            const entryForm = useEntryForm({ initial, currency: 'USD' })
            const submit = useEntrySubmit({ entryForm, currency: 'USD', onSaved, onCancel })
            return { entryForm, submit }
        },
        { wrapper }
    )
    return { hook, onSaved, onCancel }
}

beforeEach(() => {
    seedBooks({ ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] } })
})

describe('useEntrySubmit: leaving', () => {
    it('logs a refusal that arrives after the screen was left', async () => {
        const message = 'Books are closed.'
        seedBooks({
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
            refuseAfter: { after: 0, error: messageRefusal(message) },
        })
        const release = holdWrites()
        const { hook, onSaved } = renderSubmit()

        let saving: Promise<void> = Promise.resolve()
        act(() => {
            saving = hook.result.current.submit.saveDraft()
        })
        act(() => hook.result.current.submit.cancel())
        release()
        await act(async () => {
            await saving
        })

        expect(onSaved).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(warn.mock.calls)).toContain(message)
    })

    it('is not permanent: a save after leaving, with the screen still mounted, calls onSaved', async () => {
        const { hook, onSaved, onCancel } = renderSubmit()

        act(() => hook.result.current.submit.cancel())
        expect(onCancel).toHaveBeenCalledTimes(1)
        act(() => hook.result.current.entryForm.form.setValue('memo', 'Edited again'))
        await act(async () => {
            await hook.result.current.submit.saveDraft()
        })

        expect(onSaved).toHaveBeenCalledTimes(1)
    })
})
