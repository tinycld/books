// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOverridesPanel } from '../tinycld/books/hooks/useOverridesPanel'
import { COMPANY_SETTINGS, EMPTY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import type { BooksAccess, BooksCloseOverrides, BooksSettings } from '../tinycld/books/types'
import {
    holdWrites,
    liftRefusal,
    messageRefusal,
    overrideDeletes,
    overridesStore,
    seedBooks,
    serverRefusal,
    settingsStore,
    writeLog,
} from './accounts-form-harness'
import { silenceConsole, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()
silenceConsole('error')

const DAY = 24 * 60 * 60 * 1000
const STAMP = '2026-10-01 00:00:00.000Z'
const REFUSAL = 'Only an admin can grant an override.'
const CLOSED: BooksSettings = { ...COMPANY_SETTINGS }
const OPEN: BooksSettings = { ...EMPTY_SETTINGS }

function ledger(row: BooksSettings) {
    return { lines: [], entries: [], balances: [], settings: [row] }
}

function pbTime(ms: number) {
    return new Date(ms).toISOString().replace('T', ' ')
}

function override(id: string, user: string, expiresMs: number): BooksCloseOverrides {
    return {
        id,
        user,
        reason: `reason ${id}`,
        expires_at: pbTime(expiresMs),
        granted_by: 'dana',
        created: STAMP,
        updated: STAMP,
    }
}

function access(id: string, user: string, level: string): BooksAccess {
    return {
        id,
        user,
        level,
        can_read: true,
        can_write: true,
        is_admin: level === 'admin',
    }
}

const USERS = [
    { id: 'maya', name: 'Maya Ruiz', email: 'maya@example.com' },
    { id: 'dana', name: 'Dana Whitfield', email: 'dana@example.com' },
]
const ACCESS_ROWS = [access('a1', 'maya', 'bookkeeper'), access('a2', 'dana', 'admin')]

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function overrideWrites() {
    return writeLog().filter(entry => entry.startsWith('override:'))
}

function seed(opts: {
    settings?: BooksSettings
    overrides?: BooksCloseOverrides[]
    refuse?: unknown
    overridesNeverReady?: boolean
    overridesErrored?: boolean
    overridesFailsOnce?: boolean
    settingsNeverReady?: boolean
    settingsErrored?: boolean
    settingsFailsOnce?: boolean
}) {
    seedBooks({
        level: 'admin',
        ledger: ledger(opts.settings ?? CLOSED),
        users: USERS,
        accessRows: ACCESS_ROWS,
        overrides: opts.overrides,
        refuseOverrides: opts.refuse,
        overridesNeverReady: opts.overridesNeverReady,
        overridesErrored: opts.overridesErrored,
        overridesFailsOnce: opts.overridesFailsOnce,
        settingsNeverReady: opts.settingsNeverReady,
        settingsErrored: opts.settingsErrored,
        settingsFailsOnce: opts.settingsFailsOnce,
    })
}

// Reads the form state during render so react-hook-form tracks and re-renders on it.
function useWatched() {
    const panel = useOverridesPanel()
    const { errors, isSubmitted, isDirty } = panel.grantForm.formState
    return { panel, errors, isSubmitted, isDirty }
}

async function renderReady() {
    const rendered = renderHook(() => useWatched(), { wrapper })
    await waitFor(() => expect(rendered.result.current.panel.grantableUsers).toHaveLength(2))
    return rendered
}

type Rendered = Awaited<ReturnType<typeof renderReady>>

function fill(
    result: Rendered['result'],
    values: { user: string; reason: string; lasts?: '24h' | '7d' | '30d' }
) {
    act(() => {
        const form = result.current.panel.grantForm
        form.setValue('user', values.user, { shouldDirty: true })
        form.setValue('reason', values.reason, { shouldDirty: true })
        if (values.lasts) form.setValue('lasts', values.lasts, { shouldDirty: true })
    })
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
    })
}

beforeEach(() => {
    seed({})
})

describe('useOverridesPanel state', () => {
    it('reports a close date when one is set', async () => {
        const { result } = await renderReady()

        await waitFor(() => expect(result.current.panel.hasCloseDate).toBe(true))
    })

    it('reports no close date when the settings row has none', async () => {
        seed({ settings: OPEN })
        const { result } = await renderReady()

        await waitFor(() => expect(settingsStore().get(OPEN.id)).toBeDefined())
        expect(result.current.panel.hasCloseDate).toBe(false)
    })

    it('splits active and past rows and starts with history closed and the dialogs shut', async () => {
        const now = Date.now()
        seed({
            overrides: [
                override('o_live', 'maya', now + 3 * DAY),
                override('o_old', 'dana', now - 2 * DAY),
            ],
        })
        const { result } = await renderReady()

        await waitFor(() => expect(result.current.panel.active.map(o => o.id)).toEqual(['o_live']))
        expect(result.current.panel.past.map(o => o.id)).toEqual(['o_old'])
        expect(result.current.panel.isHistoryOpen).toBe(false)
        expect(result.current.panel.grantOpen).toBe(false)
        expect(result.current.panel.revokeTarget).toBeNull()
    })

    it('toggles history open and closed', async () => {
        const { result } = await renderReady()

        act(() => result.current.panel.toggleHistory())
        expect(result.current.panel.isHistoryOpen).toBe(true)
        act(() => result.current.panel.toggleHistory())
        expect(result.current.panel.isHistoryOpen).toBe(false)
    })

    it('opens and closes the grant form', async () => {
        const { result } = await renderReady()

        act(() => result.current.panel.openGrant())
        expect(result.current.panel.grantOpen).toBe(true)
        act(() => result.current.panel.closeGrant())
        expect(result.current.panel.grantOpen).toBe(false)
    })

    it('starts the grant form blank with a 24 hour length', async () => {
        const { result } = await renderReady()

        expect(result.current.panel.grantForm.getValues()).toEqual({
            user: '',
            reason: '',
            lasts: '24h',
        })
    })
})

describe('useOverridesPanel grant', () => {
    it('writes one override, closes the form and resets it on success', async () => {
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end', lasts: '7d' })
        const before = Date.now()

        act(() => result.current.panel.submitGrant())

        await waitFor(() => expect(result.current.panel.grantOpen).toBe(false))
        expect(overrideWrites()).toHaveLength(1)
        const [stored] = overridesStore().toArray
        expect(stored.user).toBe('maya')
        expect(stored.reason).toBe('Year-end')
        const expiry = new Date(String(stored.expires_at).replace(' ', 'T')).getTime()
        expect(expiry).toBeGreaterThanOrEqual(before + 7 * DAY)
        expect(result.current.panel.grantForm.getValues()).toEqual({
            user: '',
            reason: '',
            lasts: '24h',
        })
        expect(result.current.isDirty).toBe(false)
    })

    it('blocks a blank person and a short reason with the schema messages and writes nothing', async () => {
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: '', reason: 'ab' })

        act(() => result.current.panel.submitGrant())

        await waitFor(() => expect(result.current.errors.user?.message).toBe('Choose a person'))
        expect(result.current.errors.reason?.message).toBe(
            'Enter a reason of at least 3 characters'
        )
        expect(overrideWrites()).toEqual([])
        expect(result.current.panel.grantOpen).toBe(true)
    })

    it.each([
        ['message-only', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('reason', REFUSAL)],
    ])('shows the %s refusal in the form root error and keeps the typed values, dirty and submitted state', async (_n, refusal) => {
        seed({ refuse: refusal() })
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end', lasts: '30d' })

        act(() => result.current.panel.submitGrant())

        await waitFor(() => expect(result.current.errors.root?.message).toContain(REFUSAL))
        await settle()
        expect(result.current.isSubmitted).toBe(true)
        expect(result.current.isDirty).toBe(true)
        expect(result.current.panel.grantOpen).toBe(true)
        expect(result.current.panel.grantForm.getValues()).toEqual({
            user: 'maya',
            reason: 'Year-end',
            lasts: '30d',
        })
        expect(overridesStore().toArray).toEqual([])
        expect(result.current.panel.isSubmitting).toBe(false)
    })

    it('grants on a retry after a refusal', async () => {
        seed({ refuse: messageRefusal(REFUSAL) })
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end' })
        act(() => result.current.panel.submitGrant())
        await waitFor(() => expect(result.current.errors.root?.message).toContain(REFUSAL))
        await settle()

        liftRefusal()
        act(() => result.current.panel.submitGrant())

        await waitFor(() => expect(result.current.panel.grantOpen).toBe(false))
        expect(overridesStore().toArray).toHaveLength(1)
    })

    it('writes once when the form submits twice in the same tick', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end' })

        await act(async () => {
            result.current.panel.submitGrant()
            result.current.panel.submitGrant()
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(overrideWrites()).toHaveLength(1)

        release()
        await settle()
        expect(overrideWrites()).toHaveLength(1)
    })
})

describe('useOverridesPanel revoke', () => {
    const now = Date.now()
    const LIVE = override('o_live', 'maya', now + 3 * DAY)

    beforeEach(() => {
        seed({ overrides: [LIVE] })
    })

    async function renderWithRow() {
        const rendered = await renderReady()
        await waitFor(() => expect(rendered.result.current.panel.active).toHaveLength(1))
        return rendered
    }

    it('asks first, writes nothing until confirmed, and cancel clears the target', async () => {
        const { result } = await renderWithRow()

        act(() => result.current.panel.askRevoke(result.current.panel.active[0]))
        expect(result.current.panel.revokeTarget?.id).toBe('o_live')
        expect(overrideWrites()).toEqual([])

        act(() => result.current.panel.cancelRevoke())
        expect(result.current.panel.revokeTarget).toBeNull()
        expect(overrideWrites()).toEqual([])
    })

    it('confirm revokes the row, moves it to past, clears the target and never deletes', async () => {
        const { result } = await renderWithRow()
        act(() => result.current.panel.askRevoke(result.current.panel.active[0]))

        act(() => result.current.panel.confirmRevoke())

        await waitFor(() => expect(result.current.panel.past.map(o => o.id)).toEqual(['o_live']))
        expect(result.current.panel.active).toEqual([])
        expect(result.current.panel.revokeTarget).toBeNull()
        expect(overrideWrites()).toEqual(['override:o_live'])
        expect(overrideDeletes()).toEqual([])
    })
})

// Contract for the implementer: panel.part is 'loading' (overrides read not ready),
// 'error' (load failed; panel.retryLoad() recovers), 'no-close-date' (loaded, settings
// have no close date), 'empty' (loaded, close date set, no rows) or 'ready' (rows).
describe('useOverridesPanel load states', () => {
    it('reports loading, not empty, while the overrides read has not loaded', async () => {
        seed({ overridesNeverReady: true })
        const { result } = renderHook(() => useWatched(), { wrapper })
        await settle()

        expect(result.current.panel.part).toBe('loading')
    })

    it('reports an error part on a failed load and recovers on retryLoad', async () => {
        seed({
            overridesFailsOnce: true,
            overrides: [override('o_live', 'maya', Date.now() + 3 * DAY)],
        })
        const { result } = renderHook(() => useWatched(), { wrapper })
        await waitFor(() => expect(result.current.panel.part).toBe('error'))

        act(() => result.current.panel.retryLoad())

        await waitFor(() => expect(result.current.panel.part).toBe('ready'))
        expect(result.current.panel.active.map(o => o.id)).toEqual(['o_live'])
    })

    it('reports the empty part when loaded with a close date and no rows', async () => {
        const { result } = await renderReady()

        await waitFor(() => expect(result.current.panel.part).toBe('empty'))
        expect(result.current.panel.hasCloseDate).toBe(true)
    })

    it('reports the no-close-date part when settings have no close date', async () => {
        seed({ settings: OPEN })
        const { result } = await renderReady()

        await waitFor(() => expect(result.current.panel.part).toBe('no-close-date'))
    })
})

describe('useOverridesPanel settings load states', () => {
    it('reports loading, not no-close-date, while the settings row has not loaded', async () => {
        seed({ settingsNeverReady: true })
        const { result } = renderHook(() => useWatched(), { wrapper })
        await settle()

        expect(result.current.panel.part).toBe('loading')
    })

    it('reports an error part when the settings read fails', async () => {
        seed({ settingsErrored: true })
        const { result } = renderHook(() => useWatched(), { wrapper })

        await waitFor(() => expect(result.current.panel.part).toBe('error'))
    })

    it('recovers both the settings and overrides reads on retryLoad', async () => {
        seed({
            settingsFailsOnce: true,
            overridesFailsOnce: true,
            overrides: [override('o_live', 'maya', Date.now() + 3 * DAY)],
        })
        const { result } = renderHook(() => useWatched(), { wrapper })
        await waitFor(() => expect(result.current.panel.part).toBe('error'))

        act(() => result.current.panel.retryLoad())

        await waitFor(() => expect(result.current.panel.part).toBe('ready'))
        expect(result.current.panel.hasCloseDate).toBe(true)
        expect(result.current.panel.active.map(o => o.id)).toEqual(['o_live'])
    })

    it('recovers a settings-only failure on retryLoad', async () => {
        seed({ settingsFailsOnce: true })
        const { result } = renderHook(() => useWatched(), { wrapper })
        await waitFor(() => expect(result.current.panel.part).toBe('error'))

        act(() => result.current.panel.retryLoad())

        await waitFor(() => expect(result.current.panel.part).toBe('empty'))
    })
})

describe('useOverridesPanel cancelling an in-flight grant', () => {
    it('ignores closeGrant while submitting and keeps the dialog and typed values', async () => {
        const release = holdWrites()
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end', lasts: '7d' })
        act(() => result.current.panel.submitGrant())
        await waitFor(() => expect(result.current.panel.isSubmitting).toBe(true))

        act(() => result.current.panel.closeGrant())

        expect(result.current.panel.grantOpen).toBe(true)
        expect(result.current.panel.grantForm.getValues()).toEqual({
            user: 'maya',
            reason: 'Year-end',
            lasts: '7d',
        })
        release()
        await settle()
    })

    it('leaves a clean form after a held write is refused, then close and reopen', async () => {
        seed({ refuse: messageRefusal(REFUSAL) })
        const release = holdWrites()
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end' })
        act(() => result.current.panel.submitGrant())
        await waitFor(() => expect(result.current.panel.isSubmitting).toBe(true))
        act(() => result.current.panel.closeGrant())

        release()
        await waitFor(() => expect(result.current.errors.root?.message).toContain(REFUSAL))
        await settle()
        act(() => result.current.panel.closeGrant())
        act(() => result.current.panel.openGrant())

        await waitFor(() => expect(result.current.errors.root).toBeUndefined())
        expect(result.current.isSubmitted).toBe(false)
        expect(result.current.panel.grantOpen).toBe(true)
        expect(result.current.panel.grantForm.getValues()).toEqual({
            user: '',
            reason: '',
            lasts: '24h',
        })
    })
})

describe('useOverridesPanel closing the grant dialog', () => {
    const BLANK = { user: '', reason: '', lasts: '24h' }

    it('resets typed values, errors and submitted state on close', async () => {
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: '', reason: 'ab', lasts: '30d' })
        act(() => result.current.panel.submitGrant())
        await waitFor(() => expect(result.current.errors.user?.message).toBe('Choose a person'))
        expect(result.current.isSubmitted).toBe(true)

        act(() => result.current.panel.closeGrant())

        await waitFor(() => expect(result.current.isSubmitted).toBe(false))
        expect(result.current.panel.grantForm.getValues()).toEqual(BLANK)
        expect(result.current.errors.user).toBeUndefined()
        expect(result.current.errors.reason).toBeUndefined()
        expect(result.current.isDirty).toBe(false)
    })

    it('shows no stale refusal after close and reopen', async () => {
        seed({ refuse: messageRefusal(REFUSAL) })
        const { result } = await renderReady()
        act(() => result.current.panel.openGrant())
        fill(result, { user: 'maya', reason: 'Year-end' })
        act(() => result.current.panel.submitGrant())
        await waitFor(() => expect(result.current.errors.root?.message).toContain(REFUSAL))
        await settle()

        act(() => result.current.panel.closeGrant())
        act(() => result.current.panel.openGrant())

        await waitFor(() => expect(result.current.errors.root).toBeUndefined())
        expect(result.current.isSubmitted).toBe(false)
        expect(result.current.panel.grantForm.getValues()).toEqual(BLANK)
    })
})

describe('useOverridesPanel failed revoke', () => {
    const LIVE = override('o_live', 'maya', Date.now() + 3 * DAY)

    it('clears the target, rolls back, and a retry after the refusal lifts succeeds', async () => {
        seed({ overrides: [LIVE], refuse: messageRefusal(REFUSAL) })
        const { result } = await renderReady()
        await waitFor(() => expect(result.current.panel.active).toHaveLength(1))
        act(() => result.current.panel.askRevoke(result.current.panel.active[0]))

        act(() => result.current.panel.confirmRevoke())

        await settle()
        expect(result.current.panel.revokeTarget).toBeNull()
        expect(result.current.panel.active.map(o => o.id)).toEqual(['o_live'])
        expect(result.current.panel.past).toEqual([])

        liftRefusal()
        act(() => result.current.panel.askRevoke(result.current.panel.active[0]))
        act(() => result.current.panel.confirmRevoke())

        await waitFor(() => expect(result.current.panel.past.map(o => o.id)).toEqual(['o_live']))
        expect(result.current.panel.active).toEqual([])
    })
})
