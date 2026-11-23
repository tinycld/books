// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarShortcuts } from '../tinycld/books/hooks/useSidebarShortcuts'
import { DEFAULT_SHORTCUTS, type Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    heldOnDemandStore,
    holdWrites,
    ME,
    messageRefusal,
    onDemandStore,
    refuseNthWrite,
    seedBooks,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }))

// The refused save logs a warning on purpose.
const { warn: warnLog } = silenceLog()

const STAMP = '2026-11-01 00:00:00.000Z'
const CUSTOMERS: Shortcut = { kind: 'screen', ref: 'customers' }
const INVOICE: Shortcut = { kind: 'new', ref: 'invoice' }
const BALANCE_SHEET: Shortcut = { kind: 'report', ref: 'books.balance_sheet' }

function stored(id: string, user: string, items: unknown): BooksSidebarShortcuts {
    return { id, user, items, created: STAMP, updated: STAMP }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function renderShortcuts(rows: BooksSidebarShortcuts[]) {
    seedBooks({ level: 'bookkeeper' })
    const store = guardedStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', rows)
    const rendered = renderHook(() => useSidebarShortcuts(), { wrapper })
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return { ...rendered, store }
}

beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    auth.user = { id: ME }
})

describe('useSidebarShortcuts read', () => {
    it('gives the defaults to a user with no row', async () => {
        const { result } = await renderShortcuts([])

        expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS])
        expect(result.current.isCustomized).toBe(false)
    })

    it('gives the stored list in its order', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, [INVOICE, CUSTOMERS])])

        expect(result.current.shortcuts).toEqual([INVOICE, CUSTOMERS])
        expect(result.current.isCustomized).toBe(true)
    })

    it('gives an empty list, not the defaults, to a user who removed every shortcut', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, [])])

        expect(result.current.shortcuts).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('never reads another user row', async () => {
        const { result } = await renderShortcuts([stored('theirs', 'u2', [INVOICE])])

        expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS])
        expect(result.current.isCustomized).toBe(false)
    })

    it('drops what is not a shortcut from a stored list', async () => {
        const { result } = await renderShortcuts([
            stored('row1', ME, [CUSTOMERS, { kind: 'bookmark', ref: 'x' }, null, INVOICE]),
        ])

        expect(result.current.shortcuts).toEqual([CUSTOMERS, INVOICE])
    })

    it('reads a stored value that is not a list as no shortcuts', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, 'broken')])

        expect(result.current.shortcuts).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('shows no shortcuts and is not ready when no user is signed in', async () => {
        auth.user = null
        seedBooks({ level: 'bookkeeper' })
        const held = heldOnDemandStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', [])

        const { result } = renderHook(() => useSidebarShortcuts(), { wrapper })
        // Flushes the pending effects and microtasks; the disabled query asks the store
        // for nothing, so there is no load to wait for.
        await act(async () => {})

        expect(held.loads()).toBe(0)
        expect(result.current.shortcuts).toEqual([])
        expect(result.current.isReady).toBe(false)
        act(() => result.current.save([CUSTOMERS]))
        expect(enteredWrites()).toEqual([])
    })

    it('keeps the same list across renders while the stored value is the same', async () => {
        const { result, rerender } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])
        const first = result.current.shortcuts

        rerender()

        expect(result.current.shortcuts).toBe(first)
    })
})

describe('useSidebarShortcuts save', () => {
    it('makes the row on the first save, for the signed-in user', async () => {
        const { result, store } = await renderShortcuts([])

        act(() => result.current.save([INVOICE]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([INVOICE]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toHaveLength(1)
        expect(store.toArray[0]).toMatchObject({ user: ME, items: [INVOICE] })
        expect(result.current.isCustomized).toBe(true)
    })

    it('updates the row on a later save and makes no second row', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])

        act(() => result.current.save([CUSTOMERS, BALANCE_SHEET]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([CUSTOMERS, BALANCE_SHEET]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray.map(row => row.id)).toEqual(['row1'])
        expect(enteredWrites()).toEqual(['row1'])
    })

    it('saves an empty list as an empty list', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])

        act(() => result.current.save([]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray[0].items).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('runs two fast saves one after the other on one row', async () => {
        const { result, store } = await renderShortcuts([])
        const release = holdWrites()

        act(() => result.current.save([INVOICE]))
        act(() => result.current.save([INVOICE, CUSTOMERS]))
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        // The second save waits for the first: it does not reach the server while the
        // first is held.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(enteredWrites()).toHaveLength(1)
        expect(result.current.isSaving).toBe(true)
        release()

        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toHaveLength(1)
        expect(store.toArray[0].items).toEqual([INVOICE, CUSTOMERS])
        const [first, second] = enteredWrites()
        expect(second).toBe(first)
    })

    it('returns to the saved list and tells the user when the server refuses', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])
        refuseNthWrite(1, messageRefusal('Nope.'))

        act(() => result.current.save([INVOICE]))

        await waitFor(() =>
            expect(useToastStore.getState().toasts.map(toast => toast.title)).toEqual([
                'The shortcut change was not saved.',
            ])
        )
        await waitFor(() => expect(result.current.shortcuts).toEqual([CUSTOMERS]))
        expect(store.toArray[0].items).toEqual([CUSTOMERS])
        expect(result.current.isSaving).toBe(false)
        expect(warnLog).toHaveBeenCalledWith(
            'books.sidebar.shortcuts',
            'the shortcut change was not saved',
            { error: expect.objectContaining({ message: 'Nope.' }) }
        )
    })

    it('writes nothing while the read is not ready', async () => {
        seedBooks({ level: 'bookkeeper' })
        const held = heldOnDemandStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', [])
        held.hold()
        const { result } = renderHook(() => useSidebarShortcuts(), { wrapper })
        await waitFor(() => expect(held.loads()).toBe(1))
        expect(result.current.isReady).toBe(false)

        act(() => result.current.save([CUSTOMERS]))
        act(() => result.current.reset())

        expect(result.current.isSaving).toBe(false)
        expect(enteredWrites()).toEqual([])
        held.release()
        await waitFor(() => expect(result.current.isReady).toBe(true))
    })
})

describe('useSidebarShortcuts reset', () => {
    it('deletes the row, which brings the defaults back', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [INVOICE])])

        act(() => result.current.reset())

        await waitFor(() => expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toEqual([])
        expect(result.current.isCustomized).toBe(false)
    })

    it('writes nothing for a user with no row', async () => {
        const { result } = await renderShortcuts([])

        act(() => result.current.reset())

        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(enteredWrites()).toEqual([])
    })
})

describe('useSidebarShortcuts load error', () => {
    function renderRefused() {
        seedBooks({ level: 'bookkeeper' })
        const store = onDemandStore<BooksSidebarShortcuts>(
            'books_sidebar_shortcuts',
            [stored('row1', ME, [INVOICE])],
            { field: 'user', value: ME }
        )
        expectLiveQueryError(store.id)
        return { ...renderHook(() => useSidebarShortcuts(), { wrapper }), store }
    }

    it('shows no shortcut, not the defaults, and writes nothing', async () => {
        const { result, store } = renderRefused()

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.shortcuts).toEqual([])
        expect(result.current.recovery.sources).toEqual([store])
        expect(result.current.recovery.queries).toHaveLength(1)

        act(() => result.current.save([CUSTOMERS]))
        act(() => result.current.reset())
        expect(result.current.isSaving).toBe(false)
        expect(enteredWrites()).toEqual([])
    })

    it('reads the stored list after the recovery', async () => {
        const { result } = renderRefused()
        await waitFor(() => expect(result.current.isError).toBe(true))

        const onError = vi.fn()
        act(() => {
            void recoverLiveQueries({ ...result.current.recovery, onError })
        })

        await waitFor(() => expect(result.current.isError).toBe(false))
        await waitFor(() => expect(result.current.shortcuts).toEqual([INVOICE]))
        expect(onError).not.toHaveBeenCalled()
        expect(result.current.recovery).toEqual({ queries: [], sources: [] })
    })
})
