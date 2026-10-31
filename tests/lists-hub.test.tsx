// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListsHub } from '../tinycld/books/components/ListsHub'
import { SetupCard } from '../tinycld/books/components/SetupCard'
import { useBooksAccess } from '../tinycld/books/hooks/useBooksAccess'
import { useListsHub } from '../tinycld/books/hooks/useListsHub'
import { useSetupCompleted } from '../tinycld/books/hooks/useSetupCompleted'
import { LIST_ENTRIES_FIXTURE } from '../tinycld/books/lib/books-shell-fixture'
import type { ListEntry } from '../tinycld/books/lib/shell-nav'
import type { BooksSettings } from '../tinycld/books/types'
import { seedBooks, settingsStore } from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
const SETTINGS_ID = 'bookssettings01'

function settingsRow(done: boolean): BooksSettings {
    return {
        id: SETTINGS_ID,
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
        threshold_1099: 200000,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function seed(level: 'admin' | 'bookkeeper', done = false) {
    seedBooks({
        level,
        ledger: { lines: [], entries: [], balances: [], settings: [settingsRow(done)] },
    })
}

beforeEach(() => seed('bookkeeper'))

const hidden: ListEntry = {
    id: 'hidden',
    label: 'Hidden list',
    description: 'Not built yet',
    href: 'books/hidden',
    available: false,
}

describe('useListsHub', () => {
    it('returns only the available entries as cards', () => {
        const { result } = renderHook(() => useListsHub([...LIST_ENTRIES_FIXTURE, hidden]), {
            wrapper,
        })
        expect(result.current.cards.map(card => card.id)).toEqual(['accounts', 'customers'])
        expect(result.current.isEmpty).toBe(false)
    })

    it('is empty when no entry is available', () => {
        const { result } = renderHook(() => useListsHub([hidden]), { wrapper })
        expect(result.current.cards).toEqual([])
        expect(result.current.isEmpty).toBe(true)
    })
})

describe('useListsHub showSetupCard', () => {
    function renderHub() {
        return renderHook(
            () => ({
                hub: useListsHub(),
                access: useBooksAccess(),
                completed: useSetupCompleted(),
            }),
            { wrapper }
        )
    }

    it('is true for an admin whose setup is not done', async () => {
        seed('admin')
        const { result } = renderHub()
        await waitFor(() => expect(result.current.hub.showSetupCard).toBe(true))
    })

    it('is false for a non-admin even though setup is not done', async () => {
        seed('bookkeeper')
        const { result } = renderHub()
        await waitFor(() => expect(result.current.access.isReady).toBe(true))
        await waitFor(() => expect(result.current.completed).toBe(false))
        expect(result.current.access.isAdmin).toBe(false)
        expect(result.current.hub.showSetupCard).toBe(false)
    })

    it('turns false once setup_completed becomes true', async () => {
        seed('admin')
        const { result } = renderHub()
        await waitFor(() => expect(result.current.hub.showSetupCard).toBe(true))

        await act(async () => {
            const write = settingsStore().update(SETTINGS_ID, draft => {
                draft.setup_completed = true
            })
            await write.isPersisted.promise
        })

        await waitFor(() => expect(result.current.hub.showSetupCard).toBe(false))
    })

    it('is false for an admin when setup_completed is true from the start', async () => {
        seed('admin', true)
        const { result } = renderHub()
        await waitFor(() => expect(result.current.access.isReady).toBe(true))
        await waitFor(() => expect(result.current.completed).toBe(true))
        expect(result.current.access.isAdmin).toBe(true)
        expect(result.current.hub.showSetupCard).toBe(false)
    })
})

describe('SetupCard', () => {
    it('renders nothing when isVisible is false', () => {
        const { container } = render(<SetupCard isVisible={false} />, { wrapper })
        expect(container.firstChild).toBeNull()
    })

    it('renders something when isVisible is true', () => {
        const { container } = render(<SetupCard isVisible />, { wrapper })
        expect(container.firstChild).not.toBeNull()
    })

    it('navigates to the setup route when pressed', () => {
        vi.mocked(router.push).mockClear()
        render(<SetupCard isVisible />, { wrapper })
        fireEvent.click(screen.getByText('Finish setting up Books'))
        expect(router.push).toHaveBeenCalledWith('/a/books/setup')
    })
})

describe('ListsHub', () => {
    it('shows each entry label and description', () => {
        render(<ListsHub entries={LIST_ENTRIES_FIXTURE} />, { wrapper })
        for (const entry of LIST_ENTRIES_FIXTURE) {
            expect(screen.getByText(entry.label)).toBeTruthy()
            expect(screen.getByText(entry.description)).toBeTruthy()
        }
        expect(screen.queryByText('No lists yet')).toBeNull()
    })

    it('shows the empty state when no entry is available', () => {
        render(<ListsHub entries={[hidden]} />, { wrapper })
        expect(screen.getByText('No lists yet')).toBeTruthy()
        expect(screen.queryByText('Hidden list')).toBeNull()
    })

    it('navigates to the entry href when a card is pressed', () => {
        render(<ListsHub entries={LIST_ENTRIES_FIXTURE} />, { wrapper })
        fireEvent.click(screen.getByText('Accounts'))
        expect(router.push).toHaveBeenCalledWith('/a/books/accounts')
    })
})
