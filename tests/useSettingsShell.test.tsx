// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsShell } from '../tinycld/books/hooks/useSettingsShell'
import type { BooksSettings } from '../tinycld/books/types'
import { seedBooks, sequencesStore, settingsStore } from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const row: BooksSettings = {
    id: 'bookssettings01',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: 'Acme',
    ownership: '',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    setup_completed: true,
    setup_started: true,
    created: '2026-01-01 00:00:00.000Z',
    updated: '2026-01-01 00:00:00.000Z',
}

type Seed = Parameters<typeof seedBooks>[0]

function seed(opts: Seed = {}) {
    seedBooks({
        level: 'admin',
        ledger: { lines: [], entries: [], balances: [], settings: [row] },
        ...opts,
    })
}

function setWidth(width: number) {
    act(() => useWindowSizeStore.getState().setSize(width, 800))
}

async function renderShell(section: Parameters<typeof useSettingsShell>[0]) {
    const view = renderHook(() => useSettingsShell(section))
    await waitFor(() => expect(view.result.current.part).not.toBe('loading'))
    return view
}

beforeEach(() => {
    seed()
    vi.mocked(router.push).mockClear()
    vi.mocked(router.replace).mockClear()
    vi.mocked(router.back).mockClear()
    setWidth(1280)
})

describe('useSettingsShell part', () => {
    it('is detail on a wide screen and list on a phone with no section', async () => {
        expect((await renderShell(undefined)).result.current.part).toBe('detail')
        setWidth(390)
        expect((await renderShell(undefined)).result.current.part).toBe('list')
        expect((await renderShell('company')).result.current.part).toBe('detail')
    })

    it('is error when the settings row read fails', async () => {
        seed({ settingsErrored: true })
        expectLiveQueryError(settingsStore().id)
        const { result } = await renderShell('company')
        expect(result.current.part).toBe('error')
    })

    it('does not block Company when the doc sequences read fails', async () => {
        seed({ sequencesErrored: true })
        expectLiveQueryError(sequencesStore().id)
        const { result } = renderHook(() => useSettingsShell('company'))
        await waitFor(() => expect(result.current.part).toBe('detail'))
        expect(result.current.sections.find(s => s.id === 'company')?.isActive).toBe(true)
    })
})

describe('useSettingsShell navigation', () => {
    it('openSection from the wide rail replaces the history entry', async () => {
        const { result } = await renderShell('company')
        act(() => result.current.openSection('accounting'))
        expect(router.replace).toHaveBeenCalledWith('/a/books/settings/accounting')
        expect(router.push).not.toHaveBeenCalled()
    })

    it('openSection for the already open section does not navigate', async () => {
        const { result } = await renderShell('company')
        act(() => result.current.openSection('company'))
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.push).not.toHaveBeenCalled()
    })

    it('openSection for the default Company section does not navigate on the index route', async () => {
        const { result } = await renderShell(undefined)
        act(() => result.current.openSection('company'))
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.push).not.toHaveBeenCalled()
    })

    it('a phone list row opens its section with push', async () => {
        setWidth(390)
        const { result } = await renderShell(undefined)
        act(() => result.current.openSection('accounting'))
        expect(router.push).toHaveBeenCalledWith('/a/books/settings/accounting')
        expect(router.replace).not.toHaveBeenCalled()
    })

    it('back returns to the section list', async () => {
        setWidth(390)
        const { result } = await renderShell('company')
        act(() => result.current.back())
        const targets = [
            ...vi.mocked(router.push).mock.calls,
            ...vi.mocked(router.replace).mock.calls,
        ].map(call => call[0])
        expect(targets).toEqual(['/a/books/settings'])
    })
})
