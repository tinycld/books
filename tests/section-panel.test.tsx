// @vitest-environment happy-dom
import { OverlayProvider as PortalHost } from '@gluestack-ui/core/overlay/creator'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionPanel, SectionPanelScreen } from '../tinycld/books/components/settings/SectionPanel'
import { SettingsShell } from '../tinycld/books/components/settings/SettingsShell'
import { SEQUENCES } from '../tinycld/books/lib/books-settings-fixture'
import {
    keepsSectionBody,
    SETTINGS_SECTIONS,
    type SectionId,
    sectionPanelState,
} from '../tinycld/books/lib/settings-sections'
import type { BooksSettings } from '../tinycld/books/types'
import { failSettingsRead, guardedStore, seedBooks, settingsStore } from './accounts-form-harness'
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

const ENTRY_POINTS = [
    [
        'the panel of core Settings',
        (section: SectionId) => <SectionPanelScreen section={section} />,
    ],
    [
        'the Books settings shell',
        (section: SectionId) => {
            act(() => useWindowSizeStore.getState().setSize(1280, 800))
            return <SettingsShell section={section} />
        },
    ],
] as const

// The reopen question is a core Dialog, which needs the overlay's portal host to draw.
function DialogProviders({ children }: { children: ReactNode }) {
    return (
        <SidebarProviders>
            <PortalHost>{children}</PortalHost>
        </SidebarProviders>
    )
}

function failAndShowRetry(container: HTMLElement) {
    act(() => failSettingsRead())
    return waitFor(() => expect(byTestId(container, 'books-settings-panel-retry')).not.toBeNull())
}

async function retryPanel(container: HTMLElement) {
    fireEvent.click(byTestId(container, 'books-settings-panel-retry') as Element)
    await waitFor(() => expect(byTestId(container, 'books-settings-panel-error')).toBeNull())
}

function closeToggle(container: HTMLElement) {
    return byTestId(container, 'books-settings-close-toggle')
}

function closeDate(container: HTMLElement) {
    return byTestId(container, 'books-settings-close-date') as HTMLInputElement | null
}

// Turns closing off and saves: on a closed book that is a reopen, so it must ask first.
async function expectReopenQuestion(container: HTMLElement, when: string) {
    fireEvent.click(closeToggle(container) as Element)
    expect(closeToggle(container)?.getAttribute('aria-checked'), when).toBe('false')
    await expectReopenOnSave(container, when)
    fireEvent.click(closeToggle(container) as Element)
}

// Saves the changed close date and expects the reopen question, then cancels it.
async function expectReopenOnSave(container: HTMLElement, when: string) {
    const save = byTestId(container, 'books-settings-close-save') as Element
    // Save is enabled once the form state shows the change as dirty.
    await waitFor(() => expect(save.getAttribute('data-disabled'), when).toBe('false'))
    fireEvent.click(save)
    // The dialog draws in a portal, outside the rendered container.
    await waitFor(() =>
        expect(byTestId(document.body, 'books-settings-reopen-cancel'), when).not.toBeNull()
    )
    fireEvent.click(byTestId(document.body, 'books-settings-reopen-cancel') as Element)
    await waitFor(() => expect(byTestId(document.body, 'books-settings-reopen-cancel')).toBeNull())
}

describe.each(
    ENTRY_POINTS
)('a drawn Accounting section through a later read, in %s', (_n, draw) => {
    it('still shows the closed book and asks before a reopen, and Retry clears every error', async () => {
        // The server's rows: the reload after Retry reads them again.
        const serverRows = [{ ...row, close_date: '2026-09-30' }]
        seed({
            settingsFailsLater: true,
            ledger: { lines: [], entries: [], balances: [], settings: serverRows },
        })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(draw('accounting'), { wrapper: DialogProviders })
        await waitFor(() =>
            expect(closeToggle(container)?.getAttribute('aria-checked')).toBe('true')
        )

        await failAndShowRetry(container)
        expect(closeToggle(container)?.getAttribute('aria-checked')).toBe('true')
        expect(byTestId(container, 'books-settings-close-date')).not.toBeNull()
        await expectReopenQuestion(container, 'while the read has failed')

        // Another admin closed the books through a later day while the read was down.
        serverRows[0] = { ...serverRows[0], close_date: '2026-10-31' }
        await retryPanel(container)
        expect(closeToggle(container)?.getAttribute('aria-checked')).toBe('true')
        await waitFor(() => expect(closeDate(container)?.value).toBe('2026-10-31'))
        await expectReopenQuestion(container, 'after Retry')
        // A day before the new close date reopens the books, so it must ask too.
        fireEvent.input(closeDate(container) as Element, { target: { value: '2026-10-15' } })
        await expectReopenOnSave(container, 'an earlier day after Retry')
    })

    it('shows no second error and Retry in the overrides card', async () => {
        seed({ settingsFailsLater: true })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(draw('accounting'), { wrapper: SidebarProviders })
        await waitFor(() => expect(closeToggle(container)).not.toBeNull())

        await failAndShowRetry(container)
        expect(byTestId(container, 'books-settings-overrides-error')).toBeNull()
        await retryPanel(container)
        expect(byTestId(container, 'books-settings-overrides-error')).toBeNull()
    })
})

function threshold(container: HTMLElement) {
    return byTestId(container, 'books-1099-threshold') as HTMLInputElement | null
}

describe.each(ENTRY_POINTS)('a drawn 1099 section through a later read, in %s', (_n, draw) => {
    it('keeps the typed threshold through the error and the Retry', async () => {
        seed({ settingsFailsLater: true })
        // The section's link to the 1099 report reads core's reports.
        guardedStore('reports', [])
        expectLiveQueryError(settingsStore().id)
        const { container } = render(draw('form-1099'), { wrapper: SidebarProviders })
        await waitFor(() => expect(threshold(container)).not.toBeNull())
        fireEvent.input(threshold(container) as Element, { target: { value: '750.00' } })

        await failAndShowRetry(container)
        expect(threshold(container)?.value).toBe('750.00')
        expect(byTestId(container, 'books-1099-error')).toBeNull()

        await retryPanel(container)
        expect(threshold(container)?.value).toBe('750.00')
        expect(byTestId(container, 'books-1099-error')).toBeNull()
    })
})

// Numbering and Access read no settings row; these hold that a settings error with its
// Retry leaves their typed text alone too.
const TYPED_FIELDS = [
    ['numbering', `books-settings-seq-${SEQUENCES[0].doc_type}-prefix`, 'NEW-'],
    ['access', 'books-settings-access-search', 'maya'],
] as const

describe.each(ENTRY_POINTS)('the other sections through a later read, in %s', (_n, draw) => {
    it.each(
        TYPED_FIELDS
    )('%s keeps its typed text through the error and the Retry', async (section, field, text) => {
        seed({ settingsFailsLater: true, sequences: [SEQUENCES[0]] })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(draw(section), { wrapper: SidebarProviders })
        const input = () => byTestId(container, field) as HTMLInputElement | null
        await waitFor(() => expect(input()).not.toBeNull())
        fireEvent.input(input() as Element, { target: { value: text } })

        await failAndShowRetry(container)
        expect(input()?.value).toBe(text)
        await retryPanel(container)
        expect(input()?.value).toBe(text)
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
