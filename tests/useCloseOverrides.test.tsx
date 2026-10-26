// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCloseOverrides } from '../tinycld/books/hooks/useCloseOverrides'
import { splitOverrides } from '../tinycld/books/lib/overrides'
import type { BooksAccess, BooksCloseOverrides } from '../tinycld/books/types'
import {
    holdWrites,
    liftRefusal,
    messageRefusal,
    overrideDeletes,
    overridesStore,
    seedBooks,
    serverRefusal,
    writeLog,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logged = silenceLog()

const DAY = 24 * 60 * 60 * 1000
const STAMP = '2026-10-01 00:00:00.000Z'
const REFUSAL = 'Only an admin can grant an override.'

function pbTime(ms: number) {
    return new Date(ms).toISOString().replace('T', ' ')
}

function override(id: string, user: string, grantedBy: string, expiresMs: number) {
    return {
        id,
        user,
        reason: `reason ${id}`,
        expires_at: pbTime(expiresMs),
        granted_by: grantedBy,
        created: STAMP,
        updated: STAMP,
    } satisfies BooksCloseOverrides
}

function access(id: string, user: string, level: string): BooksAccess {
    return {
        id,
        user,
        level,
        can_read: level !== 'none',
        can_write: level === 'bookkeeper' || level === 'admin',
        is_admin: level === 'admin',
    }
}

const USERS = [
    { id: 'maya', name: 'Maya Ruiz', email: 'maya@example.com' },
    { id: 'nathan', name: 'Nathan Stitt', email: 'nathan@example.com' },
    { id: 'dana', name: 'Dana Whitfield', email: 'dana@example.com' },
    { id: 'lee', name: 'Lee Kim', email: 'lee@example.com' },
    { id: 'sam', name: 'Sam Ode', email: 'sam@example.com' },
]

const ACCESS_ROWS = [
    access('a1', 'maya', 'bookkeeper'),
    access('a2', 'dana', 'admin'),
    access('a3', 'lee', 'read_only'),
    access('a4', 'sam', 'none'),
]

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function overrideWrites() {
    return writeLog().filter(entry => entry.startsWith('override:'))
}

// Store rows without TanStack DB's `$` metadata keys.
function plain(row: object | undefined) {
    return Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !key.startsWith('$')))
}

function storedOverrides() {
    return overridesStore().toArray.map(plain)
}

async function renderReady() {
    const rendered = renderHook(() => useCloseOverrides(), { wrapper })
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return rendered
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
    })
}

describe('useCloseOverrides rows', () => {
    const now = Date.now()
    const rows = [
        override('o_soon', 'maya', 'nathan', now + 2 * DAY),
        override('o_far', 'dana', 'nathan', now + 9 * DAY),
        override('o_old', 'maya', 'dana', now - 3 * DAY),
        override('o_nogrant', 'dana', '', now + 5 * DAY),
        override('o_ghost', 'lee', 'removed_user', now - 8 * DAY),
    ]

    beforeEach(() => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS, overrides: rows })
    })

    it('orders overrides by expires_at descending with the person and grantor names', async () => {
        const { result } = await renderReady()

        expect(result.current.overrides?.map(o => o.id)).toEqual([
            'o_far',
            'o_nogrant',
            'o_soon',
            'o_old',
            'o_ghost',
        ])
        const byId = Object.fromEntries((result.current.overrides ?? []).map(o => [o.id, o]))
        expect(byId.o_far.userName).toBe('Dana Whitfield')
        expect(byId.o_far.grantedByName).toBe('Nathan Stitt')
        expect(byId.o_old.userName).toBe('Maya Ruiz')
        expect(byId.o_old.grantedByName).toBe('Dana Whitfield')
    })

    it('keeps a row whose grantor is missing, with grantedByName undefined', async () => {
        const { result } = await renderReady()

        const blank = result.current.overrides?.find(o => o.id === 'o_nogrant')
        const removed = result.current.overrides?.find(o => o.id === 'o_ghost')
        expect(blank?.userName).toBe('Dana Whitfield')
        expect(blank?.grantedByName).toBeUndefined()
        expect(removed?.userName).toBe('Lee Kim')
        expect(removed?.grantedByName).toBeUndefined()
    })

    it('splits active and past like splitOverrides', async () => {
        const { result } = await renderReady()

        const expected = splitOverrides(result.current.overrides ?? [], new Date())
        expect(result.current.active.map(o => o.id)).toEqual(expected.active.map(o => o.id))
        expect(result.current.past.map(o => o.id)).toEqual(expected.past.map(o => o.id))
        expect(result.current.active.map(o => o.id)).toEqual(['o_far', 'o_nogrant', 'o_soon'])
        expect(result.current.past.map(o => o.id)).toEqual(['o_old', 'o_ghost'])
    })

    it('lists only bookkeeper and admin users as grantable', async () => {
        const { result } = await renderReady()

        expect(result.current.grantableUsers.map(u => u.id).sort()).toEqual(['dana', 'maya'])
        expect(result.current.grantableUsers.find(u => u.id === 'maya')).toEqual({
            id: 'maya',
            name: 'Maya Ruiz',
            email: 'maya@example.com',
        })
    })
})

describe('useCloseOverrides grant', () => {
    beforeEach(() => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS })
    })

    it('inserts one row with the user, reason and an expiry seven days after submit, and no granted_by', async () => {
        const { result } = await renderReady()
        const before = Date.now()

        let outcome: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            outcome = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '7d' })
        })
        const after = Date.now()

        expect(outcome).toEqual({ ok: true })
        expect(overrideWrites()).toHaveLength(1)
        const rows = storedOverrides()
        expect(rows).toHaveLength(1)
        expect(rows[0].user).toBe('maya')
        expect(rows[0].reason).toBe('Year-end')
        expect('granted_by' in rows[0]).toBe(false)
        const expiry = new Date(String(rows[0].expires_at).replace(' ', 'T')).getTime()
        expect(expiry).toBeGreaterThanOrEqual(before + 7 * DAY)
        expect(expiry).toBeLessThanOrEqual(after + 7 * DAY)
        await waitFor(() => expect(result.current.active.map(o => o.user)).toEqual(['maya']))
    })

    it.each([
        ['message-only', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('reason', REFUSAL)],
    ])('returns the server message after a %s refusal and inserts nothing', async (_n, refusal) => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            refuseOverrides: refusal(),
        })
        const { result } = await renderReady()

        let outcome: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            outcome = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        await settle()

        expect(outcome?.ok).toBe(false)
        expect(outcome && !outcome.ok && outcome.message).toContain(REFUSAL)
        expect(storedOverrides()).toEqual([])
        expect(result.current.overrides).toEqual([])
    })

    it('grants again on a retry after a refusal', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            refuseOverrides: messageRefusal(REFUSAL),
        })
        const { result } = await renderReady()
        await act(async () => {
            await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        await settle()
        expect(storedOverrides()).toEqual([])

        liftRefusal()
        let outcome: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            outcome = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })

        expect(outcome).toEqual({ ok: true })
        expect(storedOverrides()).toHaveLength(1)
    })

    it('inserts once when grant runs twice in the same tick', async () => {
        const release = holdWrites()
        const { result } = await renderReady()

        await act(async () => {
            void result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
            void result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(1)

        release()
        await settle()
        expect(overrideWrites()).toHaveLength(1)
        expect(storedOverrides()).toHaveLength(1)
    })
})

describe('useCloseOverrides revoke', () => {
    const now = Date.now()
    const ROW = override('o_live', 'maya', 'nathan', now + 3 * DAY)

    beforeEach(() => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS, overrides: [ROW] })
    })

    it('updates only expires_at to now, moves the row to past, and never deletes', async () => {
        const { result } = await renderReady()
        expect(result.current.active.map(o => o.id)).toEqual(['o_live'])
        const before = Date.now()

        let outcome: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            outcome = await result.current.revoke('o_live')
        })
        const after = Date.now()

        expect(outcome).toEqual({ ok: true })
        expect(overrideWrites()).toEqual(['override:o_live'])
        const [stored] = storedOverrides()
        expect({ ...stored, expires_at: ROW.expires_at }).toEqual(plain(ROW))
        const expiry = new Date(String(stored.expires_at).replace(' ', 'T')).getTime()
        expect(expiry).toBeGreaterThanOrEqual(before)
        expect(expiry).toBeLessThanOrEqual(after)
        await waitFor(() => expect(result.current.past.map(o => o.id)).toEqual(['o_live']))
        expect(result.current.active).toEqual([])
        expect(overrideDeletes()).toEqual([])
        expect(overridesStore().toArray).toHaveLength(1)
    })

    it.each([
        ['message-only', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('expires_at', REFUSAL)],
    ])('returns the server message after a %s refusal and keeps the row active', async (_n, refusal) => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW],
            refuseOverrides: refusal(),
        })
        const { result } = await renderReady()

        let outcome: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            outcome = await result.current.revoke('o_live')
        })
        await settle()

        expect(outcome?.ok).toBe(false)
        expect(outcome && !outcome.ok && outcome.message).toContain(REFUSAL)
        expect(plain(overridesStore().get('o_live'))).toEqual(plain(ROW))
        expect(result.current.active.map(o => o.id)).toEqual(['o_live'])
        expect(result.current.past).toEqual([])
    })

    it('revokes on a retry after a refusal', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW],
            refuseOverrides: messageRefusal(REFUSAL),
        })
        const { result } = await renderReady()
        await act(async () => {
            await result.current.revoke('o_live')
        })
        await settle()

        liftRefusal()
        let outcome: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            outcome = await result.current.revoke('o_live')
        })

        expect(outcome).toEqual({ ok: true })
        await waitFor(() => expect(result.current.past.map(o => o.id)).toEqual(['o_live']))
    })

    it('writes once when revoke runs twice in the same tick', async () => {
        const release = holdWrites()
        const { result } = await renderReady()

        await act(async () => {
            void result.current.revoke('o_live')
            void result.current.revoke('o_live')
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(1)

        release()
        await settle()
        expect(overrideWrites()).toHaveLength(1)
        expect(overrideDeletes()).toEqual([])
    })
})

describe('useCloseOverrides per-operation guard', () => {
    const now = Date.now()
    const ROW_A = override('o_a', 'maya', 'nathan', now + 3 * DAY)
    const ROW_B = override('o_b', 'dana', 'nathan', now + 4 * DAY)
    const BUSY = 'Another change is still in progress.'

    beforeEach(() => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW_A, ROW_B],
        })
    })

    it('lets a revoke of a different row proceed while another revoke is pending', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.revoke('o_a'))
            outcomes.push(result.current.revoke('o_b'))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites().sort()).toEqual(['override:o_a', 'override:o_b'])

        release()
        const settled = await act(async () => Promise.all(outcomes))
        expect(settled).toEqual([{ ok: true }, { ok: true }])
    })

    it('writes once for a second revoke of the same row and does not report busy for another row', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.revoke('o_a'))
            outcomes.push(result.current.revoke('o_a'))
            outcomes.push(result.current.revoke('o_b'))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites().filter(w => w === 'override:o_a')).toHaveLength(1)
        expect(overrideWrites()).toContain('override:o_b')

        release()
        const settled = await act(async () => Promise.all(outcomes))
        expect(settled[2]).toEqual({ ok: true })
        expect(settled[2].message).not.toBe(BUSY)
    })

    it('lets a grant proceed while a revoke is pending', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.revoke('o_a'))
            outcomes.push(result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' }))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(2)

        release()
        const settled = await act(async () => Promise.all(outcomes))
        expect(settled).toEqual([{ ok: true }, { ok: true }])
    })

    it('lets a revoke proceed while a grant is pending', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' }))
            outcomes.push(result.current.revoke('o_b'))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(2)

        release()
        const settled = await act(async () => Promise.all(outcomes))
        expect(settled).toEqual([{ ok: true }, { ok: true }])
    })
})

describe('useCloseOverrides time is read at the call', () => {
    const real = Date.now()
    const ROW = override('o_live', 'maya', 'nathan', real + 3 * DAY)

    beforeEach(() => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS, overrides: [ROW] })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('computes the grant expiry from the time of the call', async () => {
        const { result } = await renderReady()
        vi.useFakeTimers({ toFake: ['Date'] })
        const callTime = real + 1000
        vi.setSystemTime(callTime)

        await act(async () => {
            const pending = result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '7d' })
            vi.setSystemTime(callTime + 5 * DAY)
            await pending
        })

        const added = storedOverrides().find(o => o.id !== 'o_live')
        expect(added?.expires_at).toBe(pbTime(callTime + 7 * DAY))
    })

    it('sets the revoke expiry to the time of the call', async () => {
        const { result } = await renderReady()
        vi.useFakeTimers({ toFake: ['Date'] })
        const callTime = real + 1000
        vi.setSystemTime(callTime)

        await act(async () => {
            const pending = result.current.revoke('o_live')
            vi.setSystemTime(callTime + 2 * DAY)
            await pending
        })

        expect(plain(overridesStore().get('o_live')).expires_at).toBe(pbTime(callTime))
    })
})

describe('useCloseOverrides expiry while mounted', () => {
    it('moves an override from active to past when it expires, and not before', async () => {
        const soon = Date.now() + 400
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [override('o_soon', 'maya', 'nathan', soon)],
        })
        const { result } = await renderReady()

        expect(result.current.active.map(o => o.id)).toEqual(['o_soon'])
        expect(result.current.past).toEqual([])

        await waitFor(() => expect(result.current.past.map(o => o.id)).toEqual(['o_soon']), {
            timeout: 4000,
        })
        expect(result.current.active).toEqual([])
        expect(Date.now()).toBeGreaterThanOrEqual(soon)
    })
})

describe('useCloseOverrides revoke of an ended override', () => {
    it('refuses without writing and leaves expires_at unchanged', async () => {
        const ended = override('o_old', 'maya', 'nathan', Date.now() - 3 * DAY)
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ended],
        })
        const { result } = await renderReady()

        let outcome: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            outcome = await result.current.revoke('o_old')
        })
        await settle()

        expect(outcome).toEqual({ ok: false, message: 'This override has already ended.' })
        expect(overrideWrites()).toEqual([])
        expect(plain(overridesStore().get('o_old')).expires_at).toBe(ended.expires_at)
    })
})

describe('useCloseOverrides guard release', () => {
    const ROW = override('o_live', 'maya', 'nathan', Date.now() + 3 * DAY)

    beforeEach(() => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS, overrides: [ROW] })
    })

    // No vi.restoreAllMocks(): it would also restore silenceLog's spies for the rest of the file.
    // seedBooks builds new collections for each test, so a spy on this test's store ends with it.

    it('grants after a grant whose insert throws before the write', async () => {
        const { result } = await renderReady()
        vi.spyOn(overridesStore(), 'insert').mockImplementationOnce(() => {
            throw new Error('rejected before write')
        })

        let first: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            first = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        expect(first?.ok).toBe(false)
        expect(overrideWrites()).toEqual([])
        expect(logged.error).toHaveBeenCalledWith('books.overrides', expect.any(Error))

        let second: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            second = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        expect(second).toEqual({ ok: true })
        expect(overrideWrites()).toHaveLength(1)
    })

    it('revokes after a revoke whose update throws before the write', async () => {
        const { result } = await renderReady()
        vi.spyOn(overridesStore(), 'update').mockImplementationOnce(() => {
            throw new Error('rejected before write')
        })

        let first: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            first = await result.current.revoke('o_live')
        })
        expect(first?.ok).toBe(false)
        expect(overrideWrites()).toEqual([])
        expect(logged.error).toHaveBeenCalledWith('books.overrides', expect.any(Error))

        let second: Awaited<ReturnType<typeof result.current.revoke>> | undefined
        await act(async () => {
            second = await result.current.revoke('o_live')
        })
        expect(second).toEqual({ ok: true })
    })

    it('revokes after a refusal of a grant, and grants after a refusal of a revoke', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW],
            refuseOverrides: messageRefusal(REFUSAL),
        })
        const { result } = await renderReady()
        await act(async () => {
            await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        await act(async () => {
            await result.current.revoke('o_live')
        })
        await settle()
        // The caller shows a refusal, so it is not an error to log.
        expect(logged.error).not.toHaveBeenCalled()

        liftRefusal()
        let granted: Awaited<ReturnType<typeof result.current.grant>> | undefined
        await act(async () => {
            granted = await result.current.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' })
        })
        expect(granted).toEqual({ ok: true })
    })
})

describe('useCloseOverrides identity', () => {
    it('returns the same overrides array across re-renders when nothing changed', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [override('o_a', 'maya', 'nathan', Date.now() + DAY)],
        })
        const { result, rerender } = await renderReady()
        const first = result.current.overrides

        rerender()
        rerender()

        expect(result.current.overrides).toBe(first)
    })
})

describe('useCloseOverrides duplicate calls share the first outcome', () => {
    const ROW = override('o_live', 'maya', 'nathan', Date.now() + 3 * DAY)
    const GRANT = { user: 'maya', reason: 'Year-end', lasts: '24h' } as const

    function track<T>(promise: Promise<T>) {
        const state = { done: false, value: undefined as T | undefined }
        void promise.then(value => {
            state.done = true
            state.value = value
        })
        return state
    }

    it('does not resolve a same-tick duplicate grant before the first write finishes', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS })
        const release = holdWrites()
        const { result } = await renderReady()
        let second: ReturnType<typeof track<{ ok: boolean }>> | undefined

        await act(async () => {
            void result.current.grant(GRANT)
            second = track(result.current.grant(GRANT))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(1)
        expect(second?.done).toBe(false)

        release()
        await settle()
        expect(second?.value).toEqual({ ok: true })
    })

    it('resolves both same-tick grants with the refusal when the held write is refused', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            refuseOverrides: messageRefusal(REFUSAL),
        })
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.grant(GRANT))
            outcomes.push(result.current.grant(GRANT))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        release()
        const settled = await act(async () => Promise.all(outcomes))

        for (const outcome of settled) {
            expect(outcome.ok).toBe(false)
            expect(outcome.message).toContain(REFUSAL)
        }
    })

    it('does not drop a grant for a different user while the first is in flight', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS })
        const release = holdWrites()
        const { result } = await renderReady()

        await act(async () => {
            void result.current.grant(GRANT)
            void result.current.grant({ ...GRANT, user: 'dana' })
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(2)

        release()
        await settle()
        expect(
            storedOverrides()
                .map(o => o.user)
                .sort()
        ).toEqual(['dana', 'maya'])
    })

    it('does not resolve a same-tick duplicate revoke before the first write finishes', async () => {
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS, overrides: [ROW] })
        const release = holdWrites()
        const { result } = await renderReady()
        let second: ReturnType<typeof track<{ ok: boolean }>> | undefined

        await act(async () => {
            void result.current.revoke('o_live')
            second = track(result.current.revoke('o_live'))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(second?.done).toBe(false)

        release()
        await settle()
        expect(second?.value).toEqual({ ok: true })
    })

    it('resolves both same-tick revokes with the refusal when the held write is refused', async () => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW],
            refuseOverrides: messageRefusal(REFUSAL),
        })
        const release = holdWrites()
        const { result } = await renderReady()
        const outcomes: Promise<{ ok: boolean; message?: string }>[] = []

        await act(async () => {
            outcomes.push(result.current.revoke('o_live'))
            outcomes.push(result.current.revoke('o_live'))
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        release()
        const settled = await act(async () => Promise.all(outcomes))

        for (const outcome of settled) {
            expect(outcome.ok).toBe(false)
            expect(outcome.message).toContain(REFUSAL)
        }
    })
})

describe('useCloseOverrides classifies with the render-time clock', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('never lists a row that arrives already expired as active', async () => {
        const real = Date.now()
        seedBooks({ level: 'admin', users: USERS, accessRows: ACCESS_ROWS })
        const seen: { active: string[]; past: string[] }[] = []
        const rendered = renderHook(
            () => {
                const value = useCloseOverrides()
                seen.push({ active: value.active.map(o => o.id), past: value.past.map(o => o.id) })
                return value
            },
            { wrapper }
        )
        await waitFor(() => expect(rendered.result.current.isReady).toBe(true))

        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(real + 3 * 60 * 60 * 1000)
        await act(async () => {
            overridesStore().insert({
                ...override('o_stale', 'maya', 'nathan', real + 60 * 60 * 1000),
            })
            await new Promise(resolve => setTimeout(resolve, 30))
        })

        expect(rendered.result.current.past.map(o => o.id)).toEqual(['o_stale'])
        expect(seen.filter(entry => entry.active.includes('o_stale'))).toEqual([])
    })
})

describe('useCloseOverrides offline failure', () => {
    const ROW = override('o_live', 'maya', 'nathan', Date.now() + 3 * DAY)
    const NETWORK = 'Failed to fetch'

    afterEach(() => {
        useConnectivityStore.setState({ isOnline: true, isServerReachable: true })
    })

    it.each([
        [
            'grant',
            (hook: ReturnType<typeof useCloseOverrides>) =>
                hook.grant({ user: 'maya', reason: 'Year-end', lasts: '24h' }),
        ],
        ['revoke', (hook: ReturnType<typeof useCloseOverrides>) => hook.revoke('o_live')],
    ])('returns the %s failure and logs it as info, not as an error, while offline', async (_n, run) => {
        seedBooks({
            level: 'admin',
            users: USERS,
            accessRows: ACCESS_ROWS,
            overrides: [ROW],
            refuseOverrides: new Error(NETWORK),
        })
        const { result } = await renderReady()
        useConnectivityStore.setState({ isOnline: false, isServerReachable: true })
        logged.info.mockImplementationOnce(() => {})

        let outcome: Awaited<ReturnType<typeof run>> | undefined
        await act(async () => {
            outcome = await run(result.current)
        })
        await settle()

        expect(outcome).toEqual({ ok: false, message: expect.stringContaining(NETWORK) })
        expect(logged.error).not.toHaveBeenCalled()
        expect(logged.info).toHaveBeenCalledWith(
            'books.overrides',
            expect.stringContaining(NETWORK)
        )
    })
})
