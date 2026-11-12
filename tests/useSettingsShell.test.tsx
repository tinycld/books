// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import * as expoRouter from 'expo-router'
import { createElement, type Provider, type ReactNode } from 'react'
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

// Vitest serves expo-router from the app shell's test stub, which adds ScreenStub: the
// screen whose navigation `useNavigation` answers inside it.
type ScreenStubValue = {
    pathname: string
    navigation: {
        isFocused: () => boolean
        dispatch: (action: unknown) => void
        getState: () => { index: number; routes: readonly StackRoute[] }
    }
}
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }
const { router } = expoRouter

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
    threshold_1099: 200000,
    sales_deposit_account: '',
    default_customer_message: '',
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

type StackRoute = { name: string }

// The Books stack the screen sits in, as `useNavigation().getState()` answers it: the
// routes from the bottom, this screen last. With none, the hook runs outside a stack.
function stackScreen(routes: readonly StackRoute[]) {
    const navigation = {
        isFocused: () => true,
        dispatch: () => {},
        getState: () => ({ index: routes.length - 1, routes }),
    }
    return ({ children }: { children: ReactNode }) =>
        createElement(ScreenStub, {
            value: { pathname: '/a/books/settings/company', navigation },
            children,
        })
}

async function renderShell(
    section: Parameters<typeof useSettingsShell>[0],
    stack?: readonly StackRoute[]
) {
    const wrapper = stack ? stackScreen(stack) : undefined
    const view = renderHook(() => useSettingsShell(section), { wrapper })
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

    it('back with no list below (a link or the wide rail opened it) replaces with the list', async () => {
        setWidth(390)
        const { result } = await renderShell('company', [{ name: 'settings/[section]' }])
        act(() => result.current.back())
        expect(router.replace).toHaveBeenCalledWith('/a/books/settings')
        expect(router.back).not.toHaveBeenCalled()
        expect(router.push).not.toHaveBeenCalled()
    })

    it('back with the section list right below pops to it', async () => {
        setWidth(390)
        const { result } = await renderShell('company', [
            { name: 'index' },
            { name: 'settings/index' },
            { name: 'settings/[section]' },
        ])
        act(() => result.current.back())
        expect(router.back).toHaveBeenCalledTimes(1)
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.push).not.toHaveBeenCalled()
    })

    it('back with the list lower in the stack, not right below, replaces with the list', async () => {
        setWidth(390)
        const { result } = await renderShell('company', [
            { name: 'settings/index' },
            { name: 'entries/index' },
            { name: 'settings/[section]' },
        ])
        act(() => result.current.back())
        expect(router.replace).toHaveBeenCalledWith('/a/books/settings')
        expect(router.back).not.toHaveBeenCalled()
    })
})
