// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useShortcutChoices } from '../tinycld/books/hooks/useShortcutChoices'
import { accessStore, cleanups, heldOnDemandStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const INVOICE_FORM = 'new:invoice'

// The reports read is healthy in every test here; only the access read is made slow or refused.
function seedWriter(opts: Parameters<typeof seedBooks>[0]) {
    seedBooks({ level: 'bookkeeper', ...opts })
    heldOnDemandStore('reports', [])
}

function ids(choices: readonly { id: string }[]) {
    return choices.map(choice => choice.id)
}

describe('useShortcutChoices', () => {
    it('offers a writer the forms once the level has loaded', async () => {
        seedWriter({})
        const hook = renderHook(() => useShortcutChoices([], ''))

        await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
        expect(hook.result.current.isError).toBe(false)
        expect(ids(hook.result.current.choices)).toContain(INVOICE_FORM)
    })

    it('shows loading, not a list without forms, while the level loads', async () => {
        seedWriter({ accessNeverReady: true })
        const hook = renderHook(() => useShortcutChoices([], ''))

        // The reports and accounts are ready at once; the level is the read still pending.
        await waitFor(() => expect(ids(hook.result.current.choices).length).toBeGreaterThan(0))
        expect(hook.result.current.isLoading).toBe(true)
        expect(hook.result.current.isError).toBe(false)
        expect(ids(hook.result.current.choices)).not.toContain(INVOICE_FORM)
    })

    it('shows the error when the access read fails, and Retry recovers it with the forms', async () => {
        seedWriter({ accessFailsOnce: true })
        expectLiveQueryError(accessStore().id)
        const hook = renderHook(() => useShortcutChoices([], ''))

        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(hook.result.current.isLoading).toBe(false)

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.isError).toBe(false))
        await waitFor(() => expect(ids(hook.result.current.choices)).toContain(INVOICE_FORM))
        expect(hook.result.current.isLoading).toBe(false)
        // The source stayed ready, so the one recovery rebuilt the failed query only.
        expect(cleanups()).toEqual([])
    })
})
