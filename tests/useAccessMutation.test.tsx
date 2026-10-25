// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import type { OrgPkgAccess } from '@tinycld/core/types/pbSchema'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccessMutation } from '../tinycld/books/hooks/useAccessMutation'
import type { BooksAdmins } from '../tinycld/books/types'
import {
    adminsStore,
    coreAccessStore,
    failReload,
    holdReload,
    holdWrites,
    liftRefusal,
    maxAccessWritesInFlight,
    messageRefusal,
    releaseAccessReads,
    seedBooks,
    serverRefusal,
    stepWrites,
    writeLog,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({
    useAuth: () => ({ user: { id: 'u1' }, isLoggedIn: true, isInitializing: false }),
}))

const logSpies = silenceLog()

const STAMP = '2026-10-01 00:00:00.000Z'
const REFUSAL = 'Only an organization owner can change this.'

type Person = Parameters<typeof useAccessMutation>[0]

const MAYA: Person = { id: 'maya', orgRole: 'member', level: 'read_only' }
const DANA: Person = { id: 'dana', orgRole: 'member', level: 'read_only' }

function core(id: string, user: string, access: OrgPkgAccess['access'], pkg = 'books') {
    return { id, user, pkg, access, created: STAMP, updated: STAMP } satisfies OrgPkgAccess
}

function adminRow(id: string, user: string) {
    return { id, user, created: STAMP, updated: STAMP } satisfies BooksAdmins
}

// Another person's row and another package's row must never be picked for Maya.
const CORE_ROWS = [
    core('core_maya', 'maya', 'readonly'),
    core('core_maya_mail', 'maya', 'none', 'mail'),
    core('core_dana', 'dana', 'readonly'),
]

const USERS = [
    { id: 'u1', name: 'Nathan Stitt', email: 'nathan@example.com', role: 'member' as const },
    { id: 'maya', name: 'Maya Ruiz', email: 'maya@example.com', role: 'member' as const },
    { id: 'dana', name: 'Dana Whitfield', email: 'dana@example.com', role: 'member' as const },
]

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function accessWrites() {
    return writeLog().filter(
        entry =>
            entry.startsWith('core:') || entry.startsWith('admin:') || entry === 'access:reload'
    )
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
    })
}

// Lets the hook's own live reads of the core and admin rows load before a write plans from them.
async function renderPerson(person: Person = MAYA) {
    const rendered = renderHook((props: Person) => useAccessMutation(props), {
        initialProps: person,
        wrapper,
    })
    await settle()
    return rendered
}

async function finish(result: { current: { isPending: boolean } }) {
    await waitFor(() => expect(result.current.isPending).toBe(false))
}

function seed(extra: Parameters<typeof seedBooks>[0] = {}) {
    seedBooks({ level: 'admin', users: USERS, coreAccess: CORE_ROWS, ...extra })
}

describe('useAccessMutation planned writes', () => {
    beforeEach(() => seed())

    it('writes the core row to full, then inserts a books_admins row, one at a time, for read_only to admin', async () => {
        const steps = stepWrites()
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await settle()
        expect(accessWrites()).toEqual(['core:update:core_maya:full'])

        await act(async () => {
            steps.next()
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(accessWrites()).toEqual(['core:update:core_maya:full', 'admin:insert:maya'])

        steps.next()
        await finish(result)
        steps.stop()
        expect(accessWrites()).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
            'access:reload',
        ])
        expect(maxAccessWritesInFlight()).toBe(1)
    })

    it('deletes the books_admins row and writes no core row for admin to bookkeeper', async () => {
        seed({
            coreAccess: [core('core_maya', 'maya', 'full')],
            bookAdmins: [adminRow('adm_maya', 'maya')],
        })
        const { result } = await renderPerson({ ...MAYA, level: 'admin' })

        act(() => result.current.setLevel('bookkeeper'))
        await finish(result)

        expect(accessWrites()).toEqual(['admin:delete:adm_maya', 'access:reload'])
        expect(adminsStore().toArray).toEqual([])
    })

    it('inserts an org_pkg_access row with access none and pkg books when the member has no core row', async () => {
        seed({ coreAccess: [] })
        const { result } = await renderPerson({ ...MAYA, level: 'bookkeeper' })

        act(() => result.current.setLevel('none'))
        await finish(result)

        expect(accessWrites()).toEqual(['core:insert:maya:books:none', 'access:reload'])
    })

    it('plans from the live rows, so a second change updates the row the first one inserted', async () => {
        seed({ coreAccess: [] })
        const { result } = await renderPerson({ ...MAYA, level: 'bookkeeper' })

        act(() => result.current.setLevel('none'))
        await finish(result)
        const inserted = coreAccessStore().toArray.find(r => r.user === 'maya')

        act(() => result.current.setLevel('read_only'))
        await finish(result)

        expect(accessWrites().slice(2)).toEqual([
            `core:update:${inserted?.id}:readonly`,
            'access:reload',
        ])
        expect(coreAccessStore().toArray.filter(r => r.user === 'maya')).toHaveLength(1)
    })

    it('writes only the books_admins insert when a Books admin who is not an org admin makes a bookkeeper admin', async () => {
        seed({ coreAccess: [core('core_maya', 'maya', 'full')] })
        const { result } = await renderPerson({ ...MAYA, level: 'bookkeeper' })

        act(() => result.current.setLevel('admin'))
        await finish(result)

        expect(accessWrites()).toEqual(['admin:insert:maya', 'access:reload'])
        expect(accessWrites().some(entry => entry.startsWith('core:'))).toBe(false)
    })
})

describe('useAccessMutation pending state and reload', () => {
    beforeEach(() => seed())

    it('shows the chosen level and pending while writing and reloading, and reloads only after the writes', async () => {
        const releaseWrites = holdWrites()
        const releaseReload = holdReload()
        const { result, rerender } = await renderPerson()
        expect(result.current.shownLevel).toBe('read_only')
        expect(result.current.isPending).toBe(false)
        expect(result.current.error).toBeNull()

        act(() => result.current.setLevel('admin'))
        await settle()
        expect(result.current.shownLevel).toBe('admin')
        expect(result.current.isPending).toBe(true)
        expect(writeLog()).not.toContain('access:reload')

        releaseWrites()
        await waitFor(() => expect(writeLog()).toContain('access:reload'))
        expect(accessWrites()).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
            'access:reload',
        ])
        expect(result.current.shownLevel).toBe('admin')
        expect(result.current.isPending).toBe(true)

        releaseReload()
        await finish(result)
        expect(writeLog().filter(entry => entry === 'access:reload')).toHaveLength(1)

        rerender({ ...MAYA, level: 'admin' })
        expect(result.current.shownLevel).toBe('admin')
    })

    it('follows the person level while idle', async () => {
        const { result, rerender } = await renderPerson()

        rerender({ ...MAYA, level: 'bookkeeper' })

        expect(result.current.shownLevel).toBe('bookkeeper')
    })

    it('finishes pending even when the reload fails', async () => {
        const { result } = await renderPerson()
        failReload(new Error('reload failed'))

        act(() => result.current.setLevel('bookkeeper'))
        await finish(result)

        expect(accessWrites()).toEqual(['core:update:core_maya:full', 'access:reload'])
    })

    it('shows a plain refresh message and keeps the chosen level when the writes succeed but the reload rejects', async () => {
        const { result } = await renderPerson()
        failReload(new Error('reload failed'))

        act(() => result.current.setLevel('bookkeeper'))
        await finish(result)
        await settle()

        expect(result.current.isPending).toBe(false)
        expect(result.current.error).toBe(
            'Access saved, but the list could not refresh. Reload to see the change.'
        )
        expect(result.current.shownLevel).toBe('bookkeeper')
    })

    async function afterReloadOnlyFailure() {
        const rendered = await renderPerson()
        failReload(new Error('reload failed'))
        act(() => rendered.result.current.setLevel('bookkeeper'))
        await finish(rendered.result)
        await settle()
        expect(rendered.result.current.error).toContain('could not refresh')
        return rendered
    }

    it('follows the real level and clears the refresh error when the live data changes later', async () => {
        const { result, rerender } = await afterReloadOnlyFailure()

        rerender({ ...MAYA, level: 'admin' })

        expect(result.current.shownLevel).toBe('admin')
        expect(result.current.error).toBeNull()
    })

    it('writes when the person is set back to the stale original level during the refresh error', async () => {
        const { result } = await afterReloadOnlyFailure()
        const before = writeLog().length

        act(() => result.current.setLevel('read_only'))
        await finish(result)
        await settle()

        expect(
            writeLog()
                .slice(before)
                .filter(entry => entry.startsWith('core:') || entry.startsWith('admin:'))
        ).not.toEqual([])
    })

    it('ignores setLevel to the level currently shown during the refresh error', async () => {
        const { result } = await afterReloadOnlyFailure()
        const before = writeLog().length

        act(() => result.current.setLevel('bookkeeper'))
        await settle()

        expect(writeLog().slice(before)).toEqual([])
        expect(result.current.isPending).toBe(false)
    })

    it('writes once when setLevel runs twice in the same tick', async () => {
        const release = holdWrites()
        const { result } = await renderPerson()

        act(() => {
            result.current.setLevel('admin')
            result.current.setLevel('admin')
        })
        await settle()
        expect(accessWrites()).toEqual(['core:update:core_maya:full'])

        release()
        await finish(result)
        expect(accessWrites()).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
            'access:reload',
        ])
    })

    it('does not block a different person while one is pending', async () => {
        const release = holdWrites()
        const both = renderHook(
            () => ({ maya: useAccessMutation(MAYA), dana: useAccessMutation(DANA) }),
            { wrapper }
        )
        await settle()

        act(() => {
            both.result.current.maya.setLevel('none')
            both.result.current.dana.setLevel('none')
        })
        await settle()
        expect(accessWrites().sort()).toEqual([
            'core:update:core_dana:none',
            'core:update:core_maya:none',
        ])

        release()
        await waitFor(() => expect(both.result.current.maya.isPending).toBe(false))
        await waitFor(() => expect(both.result.current.dana.isPending).toBe(false))
    })
})

describe('useAccessMutation refusal', () => {
    it.each([
        ['message-only', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('access', REFUSAL)],
    ])('stops, restores the old level and holds the server message after a %s refusal on the second write', async (_n, refusal) => {
        seed({ refuseAccess: { after: 1, error: refusal() } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(accessWrites().filter(entry => entry !== 'access:reload')).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
        ])
        expect(adminsStore().toArray).toEqual([])
        expect(result.current.shownLevel).toBe('read_only')
        expect(result.current.isPending).toBe(false)
        expect(result.current.error).toContain(REFUSAL)
    })

    it('stops after a refused first write without a second write', async () => {
        seed({ refuseAccess: { after: 0, error: messageRefusal(REFUSAL) } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(accessWrites().filter(entry => entry !== 'access:reload')).toEqual([
            'core:update:core_maya:full',
        ])
        expect(result.current.shownLevel).toBe('read_only')
        expect(result.current.error).toContain(REFUSAL)
    })

    // books_access is a view with no realtime, so after a partial write the real level may differ.
    it('reloads the access list after a refusal on the second write, and stays pending until it returns', async () => {
        seed({ refuseAccess: { after: 1, error: messageRefusal(REFUSAL) } })
        const releaseReload = holdReload()
        const { result, rerender } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await waitFor(() => expect(writeLog()).toContain('access:reload'))

        expect(accessWrites()).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
            'access:reload',
        ])
        expect(result.current.isPending).toBe(true)

        releaseReload()
        await finish(result)
        await settle()
        expect(writeLog().filter(entry => entry === 'access:reload')).toHaveLength(1)
        expect(result.current.error).toContain(REFUSAL)

        // The core row moved to full but the grant was refused, so the reloaded level is bookkeeper.
        rerender({ ...MAYA, level: 'bookkeeper' })
        expect(result.current.shownLevel).toBe('bookkeeper')
    })

    it('reloads the access list after a refusal on the first write', async () => {
        seed({ refuseAccess: { after: 0, error: messageRefusal(REFUSAL) } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(accessWrites()).toEqual(['core:update:core_maya:full', 'access:reload'])
        expect(result.current.error).toContain(REFUSAL)
    })

    it('clears the error and works on a retry after a refusal', async () => {
        seed({ refuseAccess: { after: 1, error: messageRefusal(REFUSAL) } })
        const { result } = await renderPerson()
        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()
        expect(result.current.error).toContain(REFUSAL)
        const before = writeLog().length

        liftRefusal()
        const release = holdWrites()
        act(() => result.current.setLevel('admin'))
        await settle()
        expect(result.current.error).toBeNull()
        expect(result.current.isPending).toBe(true)

        release()
        await finish(result)
        expect(result.current.error).toBeNull()
        // The first attempt already moved the core row to full, so only the grant remains.
        expect(
            writeLog()
                .slice(before)
                .filter(e => e !== 'access:reload')
        ).toEqual(['admin:insert:maya'])
        expect(adminsStore().toArray.map(r => r.user)).toEqual(['maya'])
    })
})

describe('useAccessMutation readiness', () => {
    it.each([
        ['core row', { coreAccessNeverReady: true }],
        ['books_admins row', { adminsNeverReady: true }],
        ['core row read that failed', { coreAccessErrored: true }],
        ['books_admins row read that failed', { adminsErrored: true }],
    ])('does nothing when setLevel runs before the %s is ready', async (_n, extra) => {
        seed(extra)
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await settle()

        expect(writeLog()).toEqual([])
        expect(result.current.isPending).toBe(false)
        expect(result.current.error).toBeNull()
        expect(result.current.shownLevel).toBe('read_only')
        expect(result.current.isReady).toBe(false)
    })

    it.each([
        ['core', { holdCoreRead: true }],
        ['books_admins', { holdAdminRead: true }],
    ])('is not ready until the %s read loads, then a call plans from the loaded rows', async (_n, extra) => {
        seed(extra)
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await settle()
        expect(writeLog()).toEqual([])
        expect(result.current.isReady).toBe(false)

        act(() => releaseAccessReads())
        await waitFor(() => expect(result.current.isReady).toBe(true))

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()
        expect(accessWrites()).toEqual([
            'core:update:core_maya:full',
            'admin:insert:maya',
            'access:reload',
        ])
    })

    it('is ready once both reads load', async () => {
        seed()
        const { result } = await renderPerson()

        expect(result.current.isReady).toBe(true)
    })
})

describe('useAccessMutation unchanged level', () => {
    it.each([
        ['read_only', MAYA],
        ['bookkeeper', { ...MAYA, level: 'bookkeeper' as const }],
    ])('plans nothing when setLevel gets the current %s level', async (_n, person) => {
        seed({ coreAccess: [core('core_maya', 'maya', 'full')] })
        const { result } = await renderPerson(person)

        act(() => result.current.setLevel(person.level))
        expect(result.current.isPending).toBe(false)
        await settle()

        expect(writeLog()).toEqual([])
        expect(result.current.isPending).toBe(false)
        expect(result.current.error).toBeNull()
    })
})

describe('useAccessMutation refusal reporting', () => {
    beforeEach(() => useToastStore.setState({ toasts: [] }))

    it.each([
        ['message-only', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('access', REFUSAL)],
    ])('does not run the default unhandled-error reporting for a %s refusal', async (_n, refusal) => {
        seed({ refuseAccess: { after: 1, error: refusal() } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(result.current.error).toContain(REFUSAL)
        expect(useToastStore.getState().toasts.map(t => t.title)).not.toContain(
            'Something went wrong'
        )
        expect(logSpies.error.mock.calls.some(call => call[0] === 'mutation.error')).toBe(false)
    })
})

describe('useAccessMutation failure logging', () => {
    it('logs a non-refusal failure of a write and still shows a message on the row', async () => {
        seed({ refuseAccess: { after: 0, error: new Error('network down') } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(result.current.error).toBeTruthy()
        expect(logSpies.error).toHaveBeenCalled()
    })

    it('does not log a plain refusal', async () => {
        seed({ refuseAccess: { after: 0, error: messageRefusal(REFUSAL) } })
        const { result } = await renderPerson()

        act(() => result.current.setLevel('admin'))
        await finish(result)
        await settle()

        expect(result.current.error).toContain(REFUSAL)
        expect(logSpies.error).not.toHaveBeenCalled()
    })
})
