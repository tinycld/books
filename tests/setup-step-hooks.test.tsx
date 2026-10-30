// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useBooksAccess } from '../tinycld/books/hooks/useBooksAccess'
import { useSetupCompleted } from '../tinycld/books/hooks/useSetupCompleted'
import { useIsStepDone, useIsStepVisible } from '../tinycld/books/setup/accounting'
import type { BooksSettings } from '../tinycld/books/types'
import { seedBooks } from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function settings(done: boolean): BooksSettings {
    return {
        id: 'bookssettings01',
        close_date: '',
        fiscal_year_start_month: 1,
        currency: 'USD',
        business_name: done ? 'Acme' : '',
        ownership: '',
        tax_id: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        setup_completed: done,
        setup_started: done,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function ledger(done: boolean) {
    return { lines: [], entries: [], balances: [], settings: [settings(done)] }
}

describe('useIsStepDone', () => {
    it('is undefined while the settings row loads', async () => {
        seedBooks({ level: 'admin', ledger: ledger(true), settingsNeverReady: true })
        const { result } = renderHook(() => ({ done: useIsStepDone(), access: useBooksAccess() }), {
            wrapper,
        })
        // Access is loaded, so undefined can only mean the settings row is not.
        await waitFor(() => expect(result.current.access.isReady).toBe(true))
        expect(result.current.done).toBeUndefined()
    })

    it('is false when setup_completed is false', async () => {
        seedBooks({ level: 'admin', ledger: ledger(false) })
        const { result } = renderHook(() => useIsStepDone(), { wrapper })
        await waitFor(() => expect(result.current).toBe(false))
    })

    it('is true when setup_completed is true', async () => {
        seedBooks({ level: 'admin', ledger: ledger(true) })
        const { result } = renderHook(() => useIsStepDone(), { wrapper })
        await waitFor(() => expect(result.current).toBe(true))
    })
})

describe('useIsStepVisible', () => {
    it('is undefined while access loads', async () => {
        seedBooks({ level: 'admin', ledger: ledger(false), accessNeverReady: true })
        const { result } = renderHook(
            () => ({ visible: useIsStepVisible(), completed: useSetupCompleted() }),
            { wrapper }
        )
        // Settings are loaded, so undefined can only mean access is not.
        await waitFor(() => expect(result.current.completed).toBe(false))
        expect(result.current.visible).toBeUndefined()
    })

    it('is true for an admin', async () => {
        seedBooks({ level: 'admin', ledger: ledger(false) })
        const { result } = renderHook(() => useIsStepVisible(), { wrapper })
        await waitFor(() => expect(result.current).toBe(true))
    })

    it.each(['bookkeeper', 'read_only'] as const)('is false for a %s', async level => {
        seedBooks({ level, ledger: ledger(false) })
        const { result } = renderHook(() => useIsStepVisible(), { wrapper })
        await waitFor(() => expect(result.current).toBe(false))
    })
})
