// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { log } from '@tinycld/core/lib/logger'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { useBooksSettings } from '../tinycld/books/hooks/useBooksSettings'
import { useReportsHub } from '../tinycld/books/hooks/useReportsHub'
import { HUB_ENTRIES_NONE, HUB_ENTRIES_V0 } from '../tinycld/books/lib/report-shell-fixture'
import type { BooksAccess } from '../tinycld/books/types'
import { accessStore, cleanups, ME, releaseAccessReads, seedBooks } from './accounts-form-harness'
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

const TRIAL_BALANCE = HUB_ENTRIES_V0.find(entry => entry.id === 'trial-balance')

function sectionsOf(hub: ReturnType<typeof useReportsHub>) {
    return hub.sections.map(section => ({
        id: section.id,
        entries: section.entries,
    }))
}

describe('useReportsHub', () => {
    it('shows no sections to level none, and is loading, not empty, while access loads', async () => {
        seedBooks({ accessRows: [LEVEL_NONE], holdAccessRead: true })
        const hook = renderHook(() => useReportsHub(HUB_ENTRIES_V0))

        expect(hook.result.current.state).toBe('loading')
        expect(hook.result.current.isEmpty).toBe(false)
        expect(hook.result.current.sections).toEqual([])

        act(() => releaseAccessReads())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(hook.result.current.sections).toEqual([])
    })

    it('shows a read-only reader the accountant section with the Trial Balance', async () => {
        seedBooks({ level: 'read_only' })
        const hook = renderHook(() => useReportsHub(HUB_ENTRIES_V0))

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(sectionsOf(hook.result.current)).toEqual([
            { id: 'accountant', entries: [TRIAL_BALANCE] },
        ])
        expect(hook.result.current.isEmpty).toBe(false)
    })

    it('stays loading, with no sections and not empty, while access never loads', async () => {
        seedBooks({ level: 'read_only', accessNeverReady: true })
        const hook = renderHook(() => ({
            hub: useReportsHub(HUB_ENTRIES_V0),
            settings: useBooksSettings(),
        }))
        // Settings are loaded, so a hub still loading can only be waiting on access.
        await waitFor(() => expect(hook.result.current.settings.isReady).toBe(true))

        expect(hook.result.current.hub.state).toBe('loading')
        expect(hook.result.current.hub.sections).toEqual([])
        expect(hook.result.current.hub.isEmpty).toBe(false)
    })

    it('reports a refused access load as an error, and retry rebuilds only the access query', async () => {
        seedBooks({ level: 'read_only', accessFailsOnce: true })
        expectLiveQueryError(accessStore().id)
        const hook = renderHook(() => useReportsHub(HUB_ENTRIES_V0))

        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.isEmpty).toBe(false)

        act(() => hook.result.current.onRetry())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(sectionsOf(hook.result.current)).toEqual([
            { id: 'accountant', entries: [TRIAL_BALANCE] },
        ])
        // The refused load failed only the access query; the source stayed ready, so core
        // cleans no source.
        expect(cleanups()).toEqual([])
    })

    it('is empty for a ready reader when no report is available', async () => {
        seedBooks({ level: 'read_only' })
        const hook = renderHook(() => useReportsHub(HUB_ENTRIES_NONE))

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(hook.result.current.isEmpty).toBe(true)
    })

    it('logs a failed recovery under books.reports and does not throw', async () => {
        seedBooks({ level: 'read_only', accessFailsTwice: true })
        const sourceId = accessStore().id
        // Both the first load and the load the retry triggers are refused.
        expectLiveQueryError(sourceId)
        const warned = vi.spyOn(console, 'warn')
        onTestFinished(() => warned.mockRestore())
        const hook = renderHook(() => useReportsHub(HUB_ENTRIES_V0))
        await waitFor(() => expect(hook.result.current.state).toBe('error'))

        expect(() => act(() => hook.result.current.onRetry())).not.toThrow()

        // The rebuilt query's preload rejects with the second refusal.
        await waitFor(() =>
            expect(log.error).toHaveBeenCalledWith(
                'books.reports',
                expect.objectContaining({
                    message: `Load of '${sourceId}' was refused`,
                    status: 403,
                })
            )
        )
        expect(log.error).toHaveBeenCalledTimes(1)
        expect(hook.result.current.state).toBe('error')
        expect(hook.result.current.isEmpty).toBe(false)
        // The source stayed ready, so core cleaned no source.
        expect(cleanups()).toEqual([])
        expect(warned).not.toHaveBeenCalled()
    })
})
