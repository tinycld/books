// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionPanel, SectionPanelScreen } from '../tinycld/books/components/settings/SectionPanel'
import { SettingsShell } from '../tinycld/books/components/settings/SettingsShell'
import {
    keepsSectionBody,
    SETTINGS_SECTIONS,
    sectionPanelState,
} from '../tinycld/books/lib/settings-sections'
import type { BooksSettings } from '../tinycld/books/types'
import { failSettingsRead, seedBooks, settingsStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import { SidebarProviders } from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()
afterEach(cleanup)

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
    purchase_lines: 'both',
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

const READY = {
    isAccessReady: true,
    isAccessError: false,
    canRead: true,
    isAdmin: true,
    isSettingsReady: true,
    isSettingsError: false,
    hasSettings: true,
}

describe('sectionPanelState', () => {
    it('is the body for every section when an admin has all the reads', () => {
        expect(SETTINGS_SECTIONS.map(s => sectionPanelState(s.id, READY))).toEqual(
            SETTINGS_SECTIONS.map(() => 'body')
        )
    })

    it('waits for the access read, then for the settings read', () => {
        expect(sectionPanelState('company', { ...READY, isAccessReady: false })).toBe('loading')
        expect(sectionPanelState('company', { ...READY, isSettingsReady: false })).toBe('loading')
    })

    it('is an error when a read fails or the settings row is absent', () => {
        expect(sectionPanelState('company', { ...READY, isAccessError: true })).toBe('error')
        expect(sectionPanelState('company', { ...READY, isSettingsError: true })).toBe('error')
        expect(sectionPanelState('company', { ...READY, hasSettings: false })).toBe('error')
    })

    it('says no access before it reads the settings a person with no level cannot read', () => {
        const none = { ...READY, canRead: false, isAdmin: false, hasSettings: false }
        expect(sectionPanelState('company', none)).toBe('no-access')
        expect(sectionPanelState('access', none)).toBe('no-access')
    })

    it('keeps the admin-only section from a person who is not a Books admin', () => {
        const bookkeeper = { ...READY, isAdmin: false }
        expect(sectionPanelState('access', bookkeeper)).toBe('admin-only')
        expect(sectionPanelState('company', bookkeeper)).toBe('body')
    })
})

describe('keepsSectionBody', () => {
    it('draws the body only in the body state before it was drawn', () => {
        expect(keepsSectionBody('body', false)).toBe(true)
        expect(keepsSectionBody('loading', false)).toBe(false)
        expect(keepsSectionBody('error', false)).toBe(false)
    })

    it('keeps a drawn body, with its unsaved text, while a later read loads or fails', () => {
        expect(keepsSectionBody('loading', true)).toBe(true)
        expect(keepsSectionBody('error', true)).toBe(true)
    })

    it('removes a drawn body when the access is lost', () => {
        expect(keepsSectionBody('no-access', true)).toBe(false)
        expect(keepsSectionBody('admin-only', true)).toBe(false)
    })
})

describe('SectionPanel', () => {
    it('draws the section body with no shell around it', async () => {
        seed()
        const { container } = render(<SectionPanel section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings')).toBeNull()
        expect(byTestId(container, 'books-settings-back')).toBeNull()
    })

    it('shows the admin-only note, not the Access section, to a bookkeeper', async () => {
        seed({ level: 'bookkeeper' })
        const { container } = render(<SectionPanel section="access" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-panel-admin-only')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings-access')).toBeNull()
    })

    it('shows the error with Retry when the settings read fails, and the body after Retry', async () => {
        seed({ settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(<SectionPanel section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-panel-error')).not.toBeNull()
        )
        fireEvent.click(byTestId(container, 'books-settings-panel-retry') as Element)
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings-panel-error')).toBeNull()
    })

    it('reloads the settings read on Retry when the read found no row', async () => {
        seed({ settingsEmptyOnce: true })
        const { container } = render(<SectionPanel section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-panel-error')).not.toBeNull()
        )
        fireEvent.click(byTestId(container, 'books-settings-panel-retry') as Element)
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings-panel-error')).toBeNull()
    })
})

function businessName(container: HTMLElement) {
    return byTestId(container, 'books-settings-company-business-name') as HTMLInputElement | null
}

// Types into the drawn Company form, fails the settings read, presses the Retry that is
// shown, and waits for the read to load again.
async function typeThenFailAndRetry(container: HTMLElement) {
    await waitFor(() => expect(businessName(container)).not.toBeNull())
    fireEvent.input(businessName(container) as Element, { target: { value: 'Acme Unsaved' } })
    expect(businessName(container)?.value).toBe('Acme Unsaved')
    act(() => failSettingsRead())
    await waitFor(() => expect(byTestId(container, 'books-settings-panel-retry')).not.toBeNull())
    fireEvent.click(byTestId(container, 'books-settings-panel-retry') as Element)
    await waitFor(() => expect(byTestId(container, 'books-settings-panel-error')).toBeNull())
}

describe('a drawn section keeps its unsaved text through a later read', () => {
    it('in the panel of core Settings', async () => {
        seed({ settingsFailsLater: true })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(<SectionPanelScreen section="company" />, {
            wrapper: SidebarProviders,
        })
        await typeThenFailAndRetry(container)
        expect(businessName(container)?.value).toBe('Acme Unsaved')
    })

    it('in the Books settings shell', async () => {
        act(() => useWindowSizeStore.getState().setSize(1280, 800))
        seed({ settingsFailsLater: true })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(<SettingsShell section="company" />, {
            wrapper: SidebarProviders,
        })
        await typeThenFailAndRetry(container)
        expect(businessName(container)?.value).toBe('Acme Unsaved')
    })
})

describe('SectionPanelScreen', () => {
    it('puts the section in its own scroller', async () => {
        seed()
        const { container } = render(<SectionPanelScreen section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        const scroller = byTestId(container, 'books-settings-panel')
        expect(
            scroller?.contains(byTestId(container, 'books-settings-company-business-name'))
        ).toBe(true)
    })
})
