// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAccessList } from '../tinycld/books/hooks/useAccessList'
import type { BooksAccess } from '../tinycld/books/types'
import { accessStore, seedBooks, usersStore } from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({
    useAuth: () => ({ user: { id: 'u1' }, isLoggedIn: true, isInitializing: false }),
}))

silenceLog()

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// The books_access view's id is the user's id.
function row(user: string, level: string): BooksAccess {
    return {
        id: user,
        user,
        level,
        can_read: level !== 'none',
        can_write: level === 'bookkeeper' || level === 'admin',
        is_admin: level === 'admin',
    }
}

const USERS = [
    { id: 'u1', name: 'Nathan Stitt', email: 'nathan@example.com', role: 'owner' as const },
    { id: 'maya', name: 'Maya Ruiz', email: 'maya@example.com', role: 'member' as const },
    { id: 'dana', name: 'Dana Whitfield', email: 'dana@example.com', role: 'admin' as const },
    { id: 'lee', name: 'Lee Kim', email: 'lee@example.com', role: 'guest' as const },
]

const ROWS = [
    row('u1', 'admin'),
    row('maya', 'read_only'),
    row('dana', 'admin'),
    row('lee', 'none'),
]

async function renderReady() {
    const rendered = renderHook(() => useAccessList(), { wrapper })
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return rendered
}

describe('useAccessList', () => {
    it('carries name, email, org role and level from the rows, ordered by name', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS })
        const { result } = await renderReady()

        expect(result.current.people?.map(p => p.id)).toEqual(['dana', 'lee', 'maya', 'u1'])
        const maya = result.current.people?.find(p => p.id === 'maya')
        expect(maya?.name).toBe('Maya Ruiz')
        expect(maya?.email).toBe('maya@example.com')
        expect(maya?.orgRole).toBe('member')
        expect(maya?.level).toBe('read_only')
        const byId = Object.fromEntries((result.current.people ?? []).map(p => [p.id, p]))
        expect(byId.dana.orgRole).toBe('admin')
        expect(byId.dana.level).toBe('admin')
        expect(byId.lee.orgRole).toBe('guest')
        expect(byId.lee.level).toBe('none')
        expect(byId.u1.orgRole).toBe('owner')
    })

    it('still lists a user whose users row is missing', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: [...ROWS, row('ghost', 'bookkeeper')],
        })
        const { result } = await renderReady()

        const ghost = result.current.people?.find(p => p.id === 'ghost')
        expect(ghost?.level).toBe('bookkeeper')
        expect(result.current.people?.map(p => p.id)).toEqual(
            expect.arrayContaining(['dana', 'lee', 'maya', 'u1'])
        )
    })

    it('reports the signed-in user role and id', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS })
        const { result } = await renderReady()

        expect(result.current.viewerId).toBe('u1')
        await waitFor(() => expect(result.current.viewerOrgRole).toBe('owner'))
    })

    it('follows the live users and access rows', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS })
        const { result } = await renderReady()

        act(() => {
            usersStore().update('maya', draft => {
                draft.name = 'Zed Ruiz'
                draft.role = 'admin'
            })
            accessStore().update('maya', draft => {
                draft.level = 'bookkeeper'
            })
        })

        await waitFor(() =>
            expect(result.current.people?.map(p => p.id)).toEqual(['dana', 'lee', 'u1', 'maya'])
        )
        const maya = result.current.people?.find(p => p.id === 'maya')
        expect(maya?.name).toBe('Zed Ruiz')
        expect(maya?.orgRole).toBe('admin')
        expect(maya?.level).toBe('bookkeeper')
    })

    it('is not ready until the access rows load', async () => {
        seedBooks({ level: 'admin', users: USERS, accessNeverReady: true })
        const { result } = renderHook(() => useAccessList(), { wrapper })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(result.current.isReady).toBe(false)
        expect(result.current.hasLoadError).toBe(false)
    })
})

describe('useAccessList readiness and load errors', () => {
    it('is not ready until the viewer org role has loaded', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS, usersNeverReady: true })
        const { result } = renderHook(() => useAccessList(), { wrapper })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })

        expect(result.current.isReady).toBe(false)
    })

    it('is ready with the real viewer role once the users read has loaded', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS })
        const { result } = await renderReady()

        expect(result.current.viewerOrgRole).toBe('owner')
    })

    it('sets hasLoadError when the users read fails', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS, usersErrored: true })
        expectLiveQueryError(usersStore().id)
        const { result } = renderHook(() => useAccessList(), { wrapper })

        await waitFor(() => expect(result.current.hasLoadError).toBe(true))
        expect(result.current.isReady).toBe(false)
    })

    it('recovers through retryLoad after the users read failed once', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ROWS, usersFailsOnce: true })
        expectLiveQueryError(usersStore().id)
        const { result } = renderHook(() => useAccessList(), { wrapper })
        await waitFor(() => expect(result.current.hasLoadError).toBe(true))

        act(() => result.current.retryLoad())

        await waitFor(() => expect(result.current.hasLoadError).toBe(false))
        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.viewerOrgRole).toBe('owner')
    })
})

// The harness cannot observe a query's where clause (TanStack DB applies a single-source where after
// the subscription), so scoping of the viewer read is covered by this behavior check only.
describe('useAccessList viewer read', () => {
    it('still reports the viewer role and recovers through retryLoad among many users', async () => {
        const many = Array.from({ length: 40 }, (_n, i) => ({
            id: `p${i}`,
            name: `Person ${i}`,
            email: `p${i}@example.com`,
            role: 'member' as const,
        }))
        seedBooks({
            level: 'admin',
            users: [...USERS, ...many],
            accessRows: [...ROWS, ...many.map(m => row(m.id, 'bookkeeper'))],
            usersFailsOnce: true,
        })
        expectLiveQueryError(usersStore().id)
        const { result } = renderHook(() => useAccessList(), { wrapper })
        await waitFor(() => expect(result.current.hasLoadError).toBe(true))

        act(() => result.current.retryLoad())

        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.hasLoadError).toBe(false)
        expect(result.current.viewerOrgRole).toBe('owner')
    })
})
