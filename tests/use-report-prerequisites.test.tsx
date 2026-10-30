// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBooksAccess } from '../tinycld/books/hooks/useBooksAccess'
import { useBooksSettings } from '../tinycld/books/hooks/useBooksSettings'
import { useReportPrerequisites } from '../tinycld/books/hooks/useReportScreen'
import { todayIso } from '../tinycld/books/lib/register-range'
import { REPORT_SETTINGS } from '../tinycld/books/lib/report-shell-fixture'
import type { BooksAccess, BooksSettings } from '../tinycld/books/types'
import {
    accessStore,
    cleanups,
    ME,
    releaseAccessReads,
    seedBooks,
    settingsStore,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const LEVEL_NONE: BooksAccess = {
    id: 'access_none',
    user: ME,
    level: 'none',
    can_read: false,
    can_write: false,
    is_admin: false,
}

// A fiscal year from April, so a context built without the settings row (month 1) shows.
const SETTINGS: BooksSettings = { ...REPORT_SETTINGS, fiscal_year_start_month: 4 }

const LEDGER = { lines: [], entries: [], balances: [], settings: [SETTINGS] }

function readyContext() {
    return { today: todayIso(), fiscalStartMonth: 4 }
}

// The stage beside a probe of the read that does not fail, so a test can tell which read it is
// waiting for. A probe of a read that fails once would take the one refusal itself.
function renderWithAccess() {
    return renderHook(() => ({ stage: useReportPrerequisites(), access: useBooksAccess() }))
}

function renderWithSettings() {
    return renderHook(() => ({ stage: useReportPrerequisites(), settings: useBooksSettings() }))
}

// How many times a live query subscribed to the settings and access sources. A rebuilt
// query subscribes again; a query left alone does not.
function sourceReads() {
    const settings = vi.spyOn(settingsStore(), 'subscribeChanges')
    const access = vi.spyOn(accessStore(), 'subscribeChanges')
    return () => ({ settings: settings.mock.calls.length, access: access.mock.calls.length })
}

describe('useReportPrerequisites', () => {
    it('is loading with no context until access loads, then ready with the context', async () => {
        seedBooks({ level: 'read_only', holdAccessRead: true, ledger: LEDGER })
        const hook = renderWithSettings()
        // Settings are loaded, so a stage still loading can only be waiting on access.
        await waitFor(() => expect(hook.result.current.settings.isReady).toBe(true))

        expect(hook.result.current.stage.state).toBe('loading')
        expect(hook.result.current.stage.context).toBeNull()

        act(() => releaseAccessReads())

        await waitFor(() => expect(hook.result.current.stage.state).toBe('ready'))
        expect(hook.result.current.stage.context).toEqual(readyContext())
    })

    it('is loading with no context while settings never load', async () => {
        seedBooks({ level: 'read_only', settingsNeverReady: true })
        const hook = renderWithAccess()
        // Access is loaded, so a stage still loading can only be waiting on settings.
        await waitFor(() => expect(hook.result.current.access.isReady).toBe(true))

        expect(hook.result.current.stage.state).toBe('loading')
        expect(hook.result.current.stage.context).toBeNull()
    })

    it('reaches no-access, not loading or error, for a level-none user', async () => {
        seedBooks({ accessRows: [LEVEL_NONE], holdAccessRead: true, ledger: LEDGER })
        const hook = renderWithSettings()
        await waitFor(() => expect(hook.result.current.settings.isReady).toBe(true))
        expect(hook.result.current.stage.state).toBe('loading')

        act(() => releaseAccessReads())

        await waitFor(() => expect(hook.result.current.stage.state).toBe('no-access'))
        expect(hook.result.current.stage.context).toBeNull()
    })

    it('is an error, not loading, when settings fail while access never loads', async () => {
        seedBooks({ level: 'read_only', settingsFailsOnce: true, accessNeverReady: true })
        expectLiveQueryError(settingsStore().id)
        const hook = renderWithAccess()

        await waitFor(() => expect(hook.result.current.stage.state).toBe('error'))
        expect(hook.result.current.access.isReady).toBe(false)
        expect(hook.result.current.stage.context).toBeNull()
    })

    it('is an error, not no-access, when settings fail for a level-none user', async () => {
        seedBooks({ accessRows: [LEVEL_NONE], settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const hook = renderWithAccess()

        await waitFor(() => expect(hook.result.current.access.isReady).toBe(true))
        expect(hook.result.current.access.canRead).toBe(false)
        await waitFor(() => expect(hook.result.current.stage.state).toBe('error'))
        expect(hook.result.current.stage.context).toBeNull()
    })

    it('reports a refused settings load as an error, and retry rebuilds only the settings query', async () => {
        seedBooks({ level: 'read_only', settingsFailsOnce: true, ledger: LEDGER })
        expectLiveQueryError(settingsStore().id)
        const reads = sourceReads()
        const hook = renderWithAccess()
        await waitFor(() => expect(hook.result.current.stage.state).toBe('error'))
        await waitFor(() => expect(hook.result.current.access.isReady).toBe(true))
        expect(hook.result.current.stage.context).toBeNull()
        const firstBuild = reads()
        expect(firstBuild.settings).toBeGreaterThan(0)
        expect(firstBuild.access).toBeGreaterThan(0)

        act(() => hook.result.current.stage.onRetry())

        await waitFor(() => expect(hook.result.current.stage.state).toBe('ready'))
        expect(hook.result.current.stage.context).toEqual(readyContext())
        const afterRetry = reads()
        expect(afterRetry.settings).toBeGreaterThan(firstBuild.settings)
        expect(afterRetry.access).toBe(firstBuild.access)
        expect(cleanups()).toEqual([])
    })

    it('reports a refused access load as an error, and retry rebuilds only the access query', async () => {
        seedBooks({ level: 'read_only', accessFailsOnce: true, ledger: LEDGER })
        expectLiveQueryError(accessStore().id)
        const reads = sourceReads()
        const hook = renderWithSettings()
        await waitFor(() => expect(hook.result.current.stage.state).toBe('error'))
        await waitFor(() => expect(hook.result.current.settings.isReady).toBe(true))
        expect(hook.result.current.stage.context).toBeNull()
        const firstBuild = reads()
        expect(firstBuild.settings).toBeGreaterThan(0)
        expect(firstBuild.access).toBeGreaterThan(0)

        act(() => hook.result.current.stage.onRetry())

        await waitFor(() => expect(hook.result.current.stage.state).toBe('ready'))
        expect(hook.result.current.stage.context).toEqual(readyContext())
        const afterRetry = reads()
        expect(afterRetry.access).toBeGreaterThan(firstBuild.access)
        expect(afterRetry.settings).toBe(firstBuild.settings)
        expect(cleanups()).toEqual([])
    })
})
