// @vitest-environment happy-dom
import { OverlayProvider as PortalHost } from '@gluestack-ui/core/overlay/creator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountPanel } from '../tinycld/books/components/accounts/AccountPanel'
import { typeLockMessage } from '../tinycld/books/lib/account-messages'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import {
    type PanelTarget,
    useAccountsPanelStore,
} from '../tinycld/books/stores/accounts-panel-store'
import {
    accountsStore,
    holdWrites,
    messageRefusal,
    seedBooks,
    serverRefusal,
    storedAccounts,
} from './accounts-form-harness'
import { byTestId, classOf } from './accounts-test-rows'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

type Placement = { isWide: boolean; isTablet: boolean }
const wide: Placement = { isWide: true, isTablet: false }
const tablet: Placement = { isWide: false, isTablet: true }
const phone: Placement = { isWide: false, isTablet: false }

const blankNew: PanelTarget = { mode: 'new', parentId: '' }

function renderPanel(target: PanelTarget | null, placement: Placement = wide) {
    act(() => useAccountsPanelStore.setState({ target }))
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <OverlayProvider>
                <PortalHost>
                    <AccountPanel {...placement} />
                </PortalHost>
            </OverlayProvider>
        </QueryClientProvider>
    )
}

// The stub renders accessibilityLabel and accessibilityRole as lowercase attributes.
function field(label: string): HTMLElement | null {
    return document.querySelector(
        `[accessibilitylabel="${label}"]:not([accessibilityrole="radio"])`
    )
}

function group(label: string): HTMLElement | null {
    return document.querySelector(`[accessibilityrole="radiogroup"][accessibilitylabel="${label}"]`)
}

function radios(label: string): HTMLElement[] {
    const el = group(label)
    return el ? Array.from(el.querySelectorAll('[accessibilityrole="radio"]')) : []
}

function choose(groupLabel: string, optionLabel: string) {
    const option = radios(groupLabel).find(
        r => r.getAttribute('accessibilitylabel') === optionLabel
    )
    if (!option) throw new Error(`no option ${optionLabel} in ${groupLabel}`)
    fireEvent.click(option)
}

function checked(groupLabel: string): HTMLElement[] {
    return radios(groupLabel).filter(r => r.getAttribute('aria-checked') === 'true')
}

function typeInto(label: string, value: string) {
    const input = field(label)
    if (!input) throw new Error(`no field ${label}`)
    fireEvent.input(input, { target: { value } })
}

function inputValue(label: string): string {
    return (field(label) as unknown as { value: string }).value
}

function press(text: string) {
    fireEvent.click(screen.getByText(text))
}

function target() {
    return useAccountsPanelStore.getState().target
}

async function editLoaded(id: string, name: string, placement: Placement = wide) {
    renderPanel({ mode: 'edit', id }, placement)
    await waitFor(() => expect(inputValue('Account name')).toBe(name))
}

beforeEach(() => {
    seedBooks()
    act(() => useAccountsPanelStore.setState({ target: null }))
})

describe('AccountPanel placement', () => {
    it('renders inline beside the list on wide', async () => {
        renderPanel(blankNew, wide)
        const panel = await waitFor(() => {
            const el = byTestId(document.body, 'account-panel')
            expect(el).not.toBeNull()
            return el
        })
        expect(classOf(panel)).not.toContain('absolute')
        expect(classOf(panel)).toContain('w-[380px]')
    })

    it.each([
        [false, true],
        [true, true],
    ])('renders as an overlay from the right on tablet (isWide=%s, isTablet=%s)', async (isWide, isTablet) => {
        renderPanel(blankNew, { isWide, isTablet })
        const panel = await waitFor(() => {
            const el = byTestId(document.body, 'account-panel')
            expect(el).not.toBeNull()
            return el
        })
        expect(classOf(panel)).toContain('absolute')
        expect(classOf(panel)).toContain('right-0')
        expect(classOf(panel)).not.toContain('bottom-0')
    })

    it('renders as a bottom-anchored overlay on phone', async () => {
        renderPanel(blankNew, phone)
        const panel = await waitFor(() => {
            const el = byTestId(document.body, 'account-panel')
            expect(el).not.toBeNull()
            return el
        })
        expect(classOf(panel)).toContain('absolute')
        expect(classOf(panel)).toContain('bottom-0')
    })

    it.each([
        wide,
        tablet,
        phone,
    ])('renders nothing when the store target is null (%o)', placement => {
        renderPanel(null, placement)
        expect(byTestId(document.body, 'account-panel')).toBeNull()
        expect(screen.queryByText('Save')).toBeNull()
        expect(screen.queryByText('Cancel')).toBeNull()
    })
})

describe('AccountPanel fields', () => {
    it('shows one disabled placeholder detail option until a type is chosen, then the real options', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(group('Detail type')).not.toBeNull())
        const before = radios('Detail type')
        expect(before).toHaveLength(1)
        expect(before[0].getAttribute('accessibilitylabel')).toBe('Choose an account type first')
        expect(before[0].getAttribute('aria-disabled')).toBe('true')

        choose('Account type', 'Bank')

        const after = radios('Detail type')
        const labels = after.map(r => r.getAttribute('accessibilitylabel'))
        expect(labels).toContain('Checking')
        expect(labels).toContain('Savings')
        expect(labels).not.toContain('Choose an account type first')
        expect(after.every(r => r.getAttribute('aria-disabled') !== 'true')).toBe(true)
    })

    it('disables the Type select and shows typeLockReason as help text for an account with sub-accounts', async () => {
        await editLoaded('acct_fa_00001', 'Fixed assets')
        const reason = typeLockMessage({ lines: 0, children: 3 })

        await waitFor(() => expect(screen.getByText(reason)).toBeTruthy())
        const options = radios('Account type')
        expect(options.length).toBeGreaterThan(1)
        expect(options.every(r => r.getAttribute('aria-disabled') === 'true')).toBe(true)
    })

    it('leaves the Type select enabled and shows no lock text for an unused account', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        const options = radios('Account type')
        expect(options.length).toBeGreaterThan(1)
        expect(options.every(r => r.getAttribute('aria-disabled') !== 'true')).toBe(true)
        expect(screen.queryByText(/cannot change|share their parent/)).toBeNull()
    })

    it('reveals the Parent account select when the sub-account toggle is turned on', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(field('Make this a sub-account')).not.toBeNull())
        expect(group('Parent account')).toBeNull()

        fireEvent.click(field('Make this a sub-account') as HTMLElement)

        expect(group('Parent account')).not.toBeNull()
    })

    it.each([
        blankNew,
        { mode: 'edit', id: 'acct_bank_0002' } as PanelTarget,
    ])('never renders currency (%o)', async panelTarget => {
        renderPanel(panelTarget)
        await waitFor(() => expect(field('Account name')).not.toBeNull())
        expect(screen.queryByText(/currency/i)).toBeNull()
        expect(
            document.querySelector(
                '[name="currency"], [testid="currency"], [testID="currency"], [accessibilitylabel*="urrency"]'
            )
        ).toBeNull()
    })

    it('clears the parent and the detail type when the type changes', async () => {
        renderPanel({ mode: 'new', parentId: 'acct_bank_0001' })
        await waitFor(() => expect(checked('Parent account')).toHaveLength(1))
        choose('Detail type', 'Checking')
        expect(checked('Detail type')).toHaveLength(1)

        choose('Account type', 'Income')

        expect(checked('Parent account')).toHaveLength(0)
        expect(checked('Detail type')).toHaveLength(0)
        expect(group('Parent account')).not.toBeNull()
    })

    it('clears the parent when the sub-account toggle is turned off and on again', async () => {
        renderPanel({ mode: 'new', parentId: 'acct_bank_0001' })
        await waitFor(() => expect(checked('Parent account')).toHaveLength(1))

        fireEvent.click(field('Make this a sub-account') as HTMLElement)
        expect(group('Parent account')).toBeNull()
        fireEvent.click(field('Make this a sub-account') as HTMLElement)

        expect(group('Parent account')).not.toBeNull()
        expect(checked('Parent account')).toHaveLength(0)
    })
})

describe('AccountPanel actions', () => {
    it('closes on Cancel', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy())

        press('Cancel')

        expect(target()).toBeNull()
    })

    it('saves a valid form and closes on Save', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Undeposited funds 2')

        press('Save')

        await waitFor(() => expect(target()).toBeNull())
        expect(storedAccounts().find(a => a.id === 'acct_oca_0001')?.name).toBe(
            'Undeposited funds 2'
        )
    })

    it('shows validation errors through FormErrorSummary and stays open on an invalid Save', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        const before = storedAccounts().length

        press('Save')

        await waitFor(() => expect(byTestId(document.body, 'account-form-errors')).not.toBeNull())
        const summary = byTestId(document.body, 'account-form-errors')
        expect(summary?.textContent).toContain('Please fix the following errors:')
        expect(summary?.textContent).toContain('name')
        expect(target()).not.toBeNull()
        expect(storedAccounts()).toHaveLength(before)
    })

    it('saves, clears the fields and keeps the panel open on Save and new', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save and new')).toBeTruthy())
        const before = storedAccounts().length
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')

        press('Save and new')

        await waitFor(() => expect(storedAccounts()).toHaveLength(before + 1))
        expect(storedAccounts().some(a => a.name === 'Petty cash')).toBe(true)
        await waitFor(() => expect(inputValue('Account name')).toBe(''))
        expect(checked('Account type')).toHaveLength(0)
        expect(target()).toMatchObject(blankNew)
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
    })

    it('offers Save and new for a new target', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        expect(screen.getByText('Save and new')).toBeTruthy()
    })

    it('does not offer Save and new for an edit target', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        expect(screen.getByText('Save')).toBeTruthy()
        expect(screen.queryByText('Save and new')).toBeNull()
    })
})

describe('AccountPanel for a read-only user', () => {
    beforeEach(() => {
        seedBooks({ level: 'read_only' })
    })

    it('disables every field and shows only a Close button', async () => {
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(screen.getByText('Close')).toBeTruthy())
        await waitFor(() => expect(inputValue('Account name')).toBe('Undeposited funds'))

        for (const label of ['Account name', 'Account number', 'Description']) {
            expect(field(label)?.getAttribute('aria-disabled')).toBe('true')
        }
        expect(field('Make this a sub-account')?.getAttribute('aria-disabled')).toBe('true')
        for (const label of ['Account type', 'Detail type']) {
            const options = radios(label)
            expect(options.length).toBeGreaterThan(0)
            expect(options.every(r => r.getAttribute('aria-disabled') === 'true')).toBe(true)
        }
        expect(screen.queryByText('Save')).toBeNull()
        expect(screen.queryByText('Save and new')).toBeNull()
        expect(screen.queryByText('Cancel')).toBeNull()
    })

    it('closes the panel from the Close button', async () => {
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(screen.getByText('Close')).toBeTruthy())

        press('Close')

        expect(target()).toBeNull()
    })
})

function summaryText() {
    return byTestId(document.body, 'account-form-errors')?.textContent ?? ''
}

function button(text: string) {
    return screen.getByText(text).closest('[role="button"]') as HTMLElement
}

function isDisabled(el: HTMLElement) {
    return (
        el.getAttribute('data-disabled') === 'true' || el.getAttribute('aria-disabled') === 'true'
    )
}

describe('AccountPanel stale errors', () => {
    async function failedSubmitWithSubAccount() {
        renderPanel(blankNew)
        await waitFor(() => expect(field('Make this a sub-account')).not.toBeNull())
        fireEvent.click(field('Make this a sub-account') as HTMLElement)
        press('Save')
        await waitFor(() => expect(summaryText()).toContain('parent'))
        expect(summaryText()).toContain('detail_type')
    }

    it('clears the parent and detail_type errors when the type changes', async () => {
        await failedSubmitWithSubAccount()

        choose('Account type', 'Bank')

        await waitFor(() => expect(summaryText()).not.toContain('detail_type'))
        expect(summaryText()).not.toContain('parent')
        expect(summaryText()).toContain('name')
    })

    it('clears the parent error when the sub-account toggle is turned off', async () => {
        await failedSubmitWithSubAccount()

        fireEvent.click(field('Make this a sub-account') as HTMLElement)

        await waitFor(() => expect(summaryText()).not.toContain('parent'))
    })
})

describe('AccountPanel edit seeding', () => {
    it('keeps the typed name when the stored row changes underneath', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Typed name')

        act(() => {
            accountsStore().update('acct_oca_0001', draft => {
                draft.description = 'changed from outside'
            })
        })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        expect(inputValue('Account name')).toBe('Typed name')
    })

    it('keeps the typed values, shows the error and stays open when the server refuses an edit', async () => {
        const message = 'Another account already uses number 1010.'
        seedBooks({ refusal: serverRefusal('number', message) })
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Typed name')

        press('Save')

        await waitFor(() => expect(summaryText()).toContain(message))
        expect(inputValue('Account name')).toBe('Typed name')
        expect(target()).not.toBeNull()
    })

    it('renders nothing while the accounts query is not ready', async () => {
        seedBooks({ accountsNeverReady: true })
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })
        expect(byTestId(document.body, 'account-panel')).toBeNull()
        expect(field('Account name')).toBeNull()
        expect(screen.queryByText('This account no longer exists')).toBeNull()
        expect(screen.queryByText('Could not load this account')).toBeNull()
    })

    it('shows the no-longer-exists notice with Save disabled when the query is ready and the row is absent', async () => {
        act(() => {
            accountsStore().delete('acct_oca_0001')
        })
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })

        await waitFor(() => expect(screen.getByText('This account no longer exists')).toBeTruthy())
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
        expect(isDisabled(button('Save'))).toBe(true)
    })

    it('disables every field while the edit target row is missing', async () => {
        act(() => {
            accountsStore().delete('acct_oca_0001')
        })
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(screen.getByText('This account no longer exists')).toBeTruthy())

        for (const label of ['Account name', 'Account number', 'Description']) {
            expect(field(label)?.getAttribute('aria-disabled')).toBe('true')
        }
        expect(field('Make this a sub-account')?.getAttribute('aria-disabled')).toBe('true')
        const typeOptions = radios('Account type')
        expect(typeOptions.length).toBeGreaterThan(0)
        expect(typeOptions.every(r => r.getAttribute('aria-disabled') === 'true')).toBe(true)
        expect(radios('Detail type').every(r => r.getAttribute('aria-disabled') === 'true')).toBe(
            true
        )
    })

    it('shows the form once the missing row is inserted', async () => {
        const row = ACCOUNTS.find(a => a.id === 'acct_oca_0001')
        if (!row) throw new Error('fixture row missing')
        act(() => {
            accountsStore().delete('acct_oca_0001')
        })
        renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(screen.getByText('This account no longer exists')).toBeTruthy())

        act(() => {
            accountsStore().insert(row)
        })

        await waitFor(() => expect(inputValue('Account name')).toBe('Undeposited funds'))
        for (const label of ['Account name', 'Account number', 'Description']) {
            expect(field(label)?.getAttribute('aria-disabled')).not.toBe('true')
        }
        expect(field('Make this a sub-account')?.getAttribute('aria-disabled')).not.toBe('true')
        expect(radios('Account type').every(r => r.getAttribute('aria-disabled') !== 'true')).toBe(
            true
        )
    })

    // Not testable here: the panel stays quiet through a transient empty result
    // with isReady false after it appeared. The harness cannot flip a live
    // collection back to not ready; that rule is covered on the hook.
    it('shows a load error when the accounts query fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            seedBooks({ accountsErrored: true })
            renderPanel({ mode: 'edit', id: 'acct_oca_0001' })

            await waitFor(() =>
                expect(screen.getByText('Could not load this account')).toBeTruthy()
            )
            expect(field('Account name')).toBeNull()
            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[Live Query Error]'))
        } finally {
            consoleError.mockRestore()
        }
    })

    it('titles the load error drawer, closes it from the X and from Close, and uses its own testID', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            seedBooks({ accountsErrored: true })
            renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
            await waitFor(() =>
                expect(screen.getByText('Could not load this account')).toBeTruthy()
            )

            expect(byTestId(document.body, 'account-panel-error')).not.toBeNull()
            expect(byTestId(document.body, 'account-panel')).toBeNull()
            expect(screen.getByText('Account')).toBeTruthy()
            const closeX = document.querySelector('[accessibilitylabel="Close"]')
            expect(closeX).not.toBeNull()

            fireEvent.click(closeX as Element)
            expect(target()).toBeNull()
        } finally {
            consoleError.mockRestore()
        }
    })

    it('closes the load error drawer with the Close button', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            seedBooks({ accountsErrored: true })
            renderPanel({ mode: 'edit', id: 'acct_oca_0001' })
            await waitFor(() =>
                expect(screen.getByText('Could not load this account')).toBeTruthy()
            )
            press('Close')
            expect(target()).toBeNull()
        } finally {
            consoleError.mockRestore()
        }
    })
})

describe('AccountPanel re-opening the same target while open', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function settle() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })
    }

    it('remounts with a fresh form when the same edit target is opened again without Cancel', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Typed name')
        expect(inputValue('Account name')).toBe('Typed name')

        act(() => useAccountsPanelStore.getState().openEdit('acct_oca_0001'))

        await waitFor(() => expect(inputValue('Account name')).toBe('Undeposited funds'))
    })

    it('neither closes nor resets the new mount when a write held from the first mount completes', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Renamed funds')
        const release = holdWrites()
        press('Save')
        await settle()
        typeInto('Account name', 'Unsaved draft')

        act(() => useAccountsPanelStore.getState().openEdit('acct_oca_0001'))
        await waitFor(() => expect(inputValue('Account name')).toBe('Renamed funds'))
        typeInto('Account name', 'Second mount')
        release()
        await settle()

        expect(target()).not.toBeNull()
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
        expect(inputValue('Account name')).toBe('Second mount')
    })

    it('sends a refusal for the first mount to notify, not to the new form', async () => {
        const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
        seedBooks({ refusal: serverRefusal('number', 'Another account already uses number 1010.') })
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Renamed funds')
        const release = holdWrites()
        press('Save')
        await settle()
        typeInto('Account name', 'Unsaved draft')

        act(() => useAccountsPanelStore.getState().openEdit('acct_oca_0001'))
        await waitFor(() => expect(inputValue('Account name')).toBe('Renamed funds'))
        release()
        await settle()

        expect(emit).toHaveBeenCalled()
        expect(target()).not.toBeNull()
        expect(summaryText()).not.toContain('Another account already uses number 1010.')
    })
})

describe('AccountPanel type lock while usage loads', () => {
    it('disables every Type option while the usage query is not ready', async () => {
        seedBooks({ linesNeverReady: true })
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        const options = radios('Account type')
        expect(options.length).toBeGreaterThan(1)
        expect(options.every(r => r.getAttribute('aria-disabled') === 'true')).toBe(true)
    })
})

describe('AccountPanel refusals', () => {
    it('lists a message-only refusal in the error summary and keeps the panel open', async () => {
        const message = 'Cannot place an account under an inactive parent.'
        seedBooks({ refusal: messageRefusal(message) })
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')

        press('Save')

        await waitFor(() => expect(summaryText()).toContain(message))
        expect(target()).not.toBeNull()
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
    })

    it('shows a field-shaped refusal as a field error and keeps the panel open', async () => {
        const message = 'Another account already uses number 1005.'
        seedBooks({ refusal: serverRefusal('number', message) })
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')

        press('Save')

        await waitFor(() => expect(summaryText()).toContain(message))
        expect(target()).not.toBeNull()
    })
})

describe('AccountPanel save buttons', () => {
    async function filledNew() {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')
    }

    it('disables Save and Save and new while a save is pending', async () => {
        await filledNew()
        const release = holdWrites()

        press('Save')

        await waitFor(() => expect(isDisabled(button('Save'))).toBe(true))
        expect(isDisabled(button('Save and new'))).toBe(true)
        release()
        await waitFor(() => expect(target()).toBeNull())
    })

    it.each([
        'Save',
        'Save and new',
    ])('does not write on %s while the app is offline', async label => {
        useConnectivityStore.setState({ isOnline: false, isServerReachable: true })
        try {
            await filledNew()
            const before = storedAccounts().length
            const pressed = button(label)

            press(label)
            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 60))
            })

            expect(isDisabled(pressed)).toBe(true)
            expect(storedAccounts()).toHaveLength(before)
        } finally {
            useConnectivityStore.setState({ isOnline: true, isServerReachable: true })
        }
    })
})

describe('AccountPanel re-selecting the chosen type', () => {
    it('keeps the detail type and the parent when the already chosen type is pressed again', async () => {
        renderPanel({ mode: 'new', parentId: 'acct_bank_0001' })
        await waitFor(() => expect(checked('Parent account')).toHaveLength(1))
        choose('Detail type', 'Checking')

        choose('Account type', 'Bank')

        expect(checked('Detail type')).toHaveLength(1)
        expect(checked('Parent account')).toHaveLength(1)
    })
})

describe('AccountPanel save in flight while the target changes', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not close the panel for the new target when the old target save completes', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Renamed funds')
        const release = holdWrites()
        press('Save')
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0002'))
        await waitFor(() => expect(inputValue('Account name')).toBe('Operating checking'))
        release()
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        expect(storedAccounts().find(a => a.id === 'acct_oca_0001')?.name).toBe('Renamed funds')
        expect(target()).toMatchObject({ mode: 'edit', id: 'acct_bank_0002' })
        expect(inputValue('Account name')).toBe('Operating checking')
    })

    it('surfaces a refused write through notify, not on the dead form, and keeps the new panel open', async () => {
        const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
        seedBooks({ refusal: serverRefusal('number', 'Another account already uses number 1010.') })
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Renamed funds')
        const release = holdWrites()
        press('Save')
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0002'))
        await waitFor(() => expect(inputValue('Account name')).toBe('Operating checking'))
        release()
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        expect(emit).toHaveBeenCalled()
        expect(target()).toMatchObject({ mode: 'edit', id: 'acct_bank_0002' })
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
        expect(summaryText()).not.toContain('Another account already uses number 1010.')
    })
})

describe('AccountPanel when the edited row disappears', () => {
    it('keeps the body mounted with the typed input and shows a notice with Save disabled', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        typeInto('Account name', 'Typed name')

        act(() => {
            accountsStore().delete('acct_oca_0001')
        })

        await waitFor(() => expect(screen.getByText('This account no longer exists')).toBeTruthy())
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
        expect(inputValue('Account name')).toBe('Typed name')
        expect(isDisabled(button('Save'))).toBe(true)
    })
})

describe('AccountPanel usage hint', () => {
    const hint = 'Checking whether this account is used...'

    it('shows the hint and disables Type while usage loads', async () => {
        seedBooks({ linesNeverReady: true })
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        expect(screen.getByText(hint)).toBeTruthy()
        expect(radios('Account type').every(r => r.getAttribute('aria-disabled') === 'true')).toBe(
            true
        )
    })

    it('drops the hint and enables Type once usage is ready with no lines or sub-accounts', async () => {
        await editLoaded('acct_oca_0001', 'Undeposited funds')
        await waitFor(() => expect(screen.queryByText(hint)).toBeNull())
        expect(radios('Account type').every(r => r.getAttribute('aria-disabled') !== 'true')).toBe(
            true
        )
    })
})

describe('AccountPanel after a refused save', () => {
    async function filledNew(panelTarget: PanelTarget = blankNew) {
        renderPanel(panelTarget)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')
    }

    it('clears a message-only error from the summary when a field is edited', async () => {
        const message = 'Cannot place an account under an inactive parent.'
        seedBooks({ refusal: messageRefusal(message) })
        await filledNew()
        press('Save')
        await waitFor(() => expect(summaryText()).toContain(message))

        typeInto('Account name', 'Petty cash 2')

        await waitFor(() => expect(summaryText()).not.toContain(message))
    })

    it('keeps the fields and the panel open on Save and new', async () => {
        const message = 'Cannot place an account under an inactive parent.'
        seedBooks({ refusal: messageRefusal(message) })
        await filledNew()
        const before = storedAccounts().length

        press('Save and new')

        await waitFor(() => expect(summaryText()).toContain(message))
        expect(inputValue('Account name')).toBe('Petty cash')
        expect(checked('Account type')).toHaveLength(1)
        expect(checked('Detail type')).toHaveLength(1)
        expect(target()).toMatchObject(blankNew)
        expect(storedAccounts()).toHaveLength(before)
    })

    it('keeps the parent and the type pre-filled after Save and new for a new sub-account', async () => {
        const subAccount: PanelTarget = { mode: 'new', parentId: 'acct_bank_0001' }
        renderPanel(subAccount)
        await waitFor(() => expect(checked('Parent account')).toHaveLength(1))
        const before = storedAccounts().length
        typeInto('Account name', 'Petty cash')
        choose('Detail type', 'Cash on hand')

        press('Save and new')

        await waitFor(() => expect(storedAccounts()).toHaveLength(before + 1))
        await waitFor(() => expect(inputValue('Account name')).toBe(''))
        expect(checked('Parent account')).toHaveLength(1)
        expect(checked('Account type')[0].getAttribute('accessibilitylabel')).toBe('Bank')
        expect(target()).toMatchObject(subAccount)
    })
})

describe('AccountPanel double press', () => {
    it('inserts one row when Save is pressed twice quickly', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Petty cash')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')
        const release = holdWrites()

        const save = button('Save')
        fireEvent.click(save)
        fireEvent.click(save)
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })
        release()

        await waitFor(() => expect(target()).toBeNull())
        expect(storedAccounts().filter(a => a.name === 'Petty cash')).toHaveLength(1)
    })
})

describe('AccountPanel retarget detection by object identity', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function filledNew() {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        typeInto('Account name', 'Old panel')
        choose('Account type', 'Bank')
        choose('Detail type', 'Cash on hand')
    }

    async function settle() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })
    }

    it('surfaces a refusal through notify when the panel was cancelled while the save was held', async () => {
        const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
        seedBooks({ refusal: serverRefusal('number', 'Another account already uses number 1010.') })
        await filledNew()
        const release = holdWrites()
        press('Save')
        await settle()

        press('Cancel')
        await waitFor(() => expect(target()).toBeNull())
        release()
        await settle()

        expect(emit).toHaveBeenCalled()
        expect(target()).toBeNull()
    })

    it.each([
        'Save',
        'Save and new',
    ])('keeps the fresh New account panel open and untouched when the write from %s on the cancelled panel completes', async label => {
        await filledNew()
        const release = holdWrites()
        press(label)
        await settle()

        press('Cancel')
        await waitFor(() => expect(target()).toBeNull())
        act(() => useAccountsPanelStore.getState().openNew())
        await waitFor(() => expect(inputValue('Account name')).toBe(''))
        typeInto('Account name', 'Fresh panel')
        release()
        await settle()

        expect(target()).toMatchObject(blankNew)
        expect(byTestId(document.body, 'account-panel')).not.toBeNull()
        expect(inputValue('Account name')).toBe('Fresh panel')
    })
})

describe('AccountPanel account number label', () => {
    it('shows the visible text Account number (optional) and keeps the accessibility label Account number', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(field('Account number')).not.toBeNull())

        expect(screen.getByText('Account number (optional)')).toBeTruthy()
        expect(screen.queryByText('Account number')).toBeNull()
    })
})

describe('AccountPanel scroll affordance borders', () => {
    it('gives the header a bottom border and the action bar a top border', async () => {
        renderPanel(blankNew)
        const panel = await waitFor(() => {
            const el = byTestId(document.body, 'account-panel')
            expect(el).not.toBeNull()
            return el as HTMLElement
        })

        const header = byTestId(panel, 'account-panel-header')
        const footer = byTestId(panel, 'account-panel-footer')
        expect(header).not.toBeNull()
        expect(footer).not.toBeNull()
        expect(classOf(header)).toMatch(/(?:^|\s)border-b(?:\s|$)/)
        expect(classOf(footer)).toMatch(/(?:^|\s)border-t(?:\s|$)/)
    })

    it('puts the Save button inside the bordered action bar and the title inside the header', async () => {
        renderPanel(blankNew)
        await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
        const panel = byTestId(document.body, 'account-panel') as HTMLElement

        const header = byTestId(panel, 'account-panel-header')
        const footer = byTestId(panel, 'account-panel-footer')
        expect(header).not.toBeNull()
        expect(footer).not.toBeNull()
        expect(header?.textContent).toContain('New account')
        expect(footer?.textContent).toContain('Save')
    })
})
