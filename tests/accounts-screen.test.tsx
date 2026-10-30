// @vitest-environment happy-dom
import { OverlayProvider as PortalHost } from '@gluestack-ui/core/overlay/creator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsScreenView } from '../tinycld/books/components/accounts/AccountsScreenView'
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { useAccountsPanelStore } from '../tinycld/books/stores/accounts-panel-store'
import { seedBooks } from './accounts-form-harness'
import { byTestId, classOf, fixtureRows } from './accounts-test-rows'
import { viewProps } from './accounts-view-props'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function renderView(
    props: {
        isReady?: boolean
        isWide?: boolean
        canWrite?: boolean
        isError?: boolean
        tree?: ReturnType<typeof useAccountTree<AccountRow>>
    } = {}
) {
    const tree = props.tree ?? renderHook(() => useAccountTree(fixtureRows())).result.current
    const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onRetry: vi.fn() }
    const view = render(
        <AccountsScreenView
            isReady={props.isReady ?? true}
            isWide={props.isWide ?? true}
            canWrite={props.canWrite ?? true}
            isError={props.isError ?? false}
            tree={tree}
            {...viewProps()}
            {...handlers}
        />
    )
    return { ...view, ...handlers }
}

describe('AccountsScreenView', () => {
    beforeEach(() => {
        vi.mocked(router.push).mockClear()
    })

    it('renders LoadingState and no table while the query is not ready', () => {
        const { container } = renderView({ isReady: false })
        expect(container.querySelector('rn-activityindicator')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it('renders the table and not cards when ready and wide', () => {
        const { container } = renderView({ isWide: true })
        expect(container.querySelector('rn-activityindicator')).toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).not.toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it('renders cards and not the table when ready and not wide', () => {
        const { container } = renderView({ isWide: false })
        expect(byTestId(container, 'account-card-acct_bank_0001')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
    })

    it('shows the back link All lists that goes to books/lists', () => {
        const { getByText } = renderView()
        fireEvent.click(getByText('All lists'))
        expect(router.push).toHaveBeenCalledWith('/a/books/lists')
    })

    it('shows the title Chart of Accounts', () => {
        const { getByText } = renderView()
        expect(getByText('Chart of Accounts')).toBeTruthy()
    })

    it('gives a phone writer a New account header button and renders no FAB', () => {
        const { container, onNew } = renderView({ isWide: false, canWrite: true })
        const button = byTestId(container, 'account-new-header')
        expect(button).not.toBeNull()
        expect(button?.textContent).toContain('New account')
        fireEvent.click(button as HTMLElement)
        expect(onNew).toHaveBeenCalledTimes(1)
        expect(container.querySelector('[accessibilitylabel="New"]')).toBeNull()
    })

    it('gives a read-only user no New account button', () => {
        const { container, queryByText } = renderView({ isWide: false, canWrite: false })
        expect(byTestId(container, 'account-new-header')).toBeNull()
        expect(queryByText('New account')).toBeNull()
    })
})

describe('AccountsScreenView error state', () => {
    it('shows an alert message and no spinner when the query failed', () => {
        const { container, getByText } = renderView({ isReady: false, isError: true })
        expect(byTestId(container, 'accounts-error')).not.toBeNull()
        expect(getByText(/Could not load accounts/)).toBeTruthy()
        expect(container.querySelector('rn-activityindicator')).toBeNull()
    })

    it('shows only the error when the query is ready and failed', () => {
        const { container } = renderView({ isReady: true, isError: true })
        expect(byTestId(container, 'accounts-error')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
        expect(container.querySelector('rn-activityindicator')).toBeNull()
    })

    it('calls onRetry when Retry is pressed', () => {
        const { getByText, onRetry } = renderView({ isReady: false, isError: true })
        fireEvent.click(getByText('Retry'))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('shows no error element when the query is healthy', () => {
        const { container, queryByText } = renderView()
        expect(byTestId(container, 'accounts-error')).toBeNull()
        expect(queryByText('Retry')).toBeNull()
    })
})

describe('AccountsScreenView loading keeps the header', () => {
    it.each([true, false])('keeps back link and title while loading (wide=%s)', isWide => {
        const { container, getByText } = renderView({ isReady: false, isWide })
        expect(getByText('All lists')).toBeTruthy()
        expect(getByText('Chart of Accounts')).toBeTruthy()
        expect(container.querySelector('rn-activityindicator')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })
})

describe('AccountsScreenView with a search query', () => {
    function searchTree() {
        const hook = renderHook(() => useAccountTree(fixtureRows()))
        act(() => hook.result.current.setQuery('rent'))
        return hook.result.current
    }

    it.each([true, false])('renders no caret while searching (wide=%s)', isWide => {
        const { container } = renderView({ isWide, tree: searchTree() })
        expect(
            container.querySelectorAll('[testID^="account-caret-"], [testid^="account-caret-"]')
        ).toHaveLength(0)
    })

    it('renders carets with no query', () => {
        const { container } = renderView({ isWide: true })
        expect(byTestId(container, 'account-caret-acct_exp_0001')).not.toBeNull()
    })
})

describe('AccountsScreenView selected row', () => {
    beforeEach(() => {
        seedBooks()
        act(() => useAccountsPanelStore.setState({ target: null }))
    })

    function renderWithPanel(isWide: boolean) {
        const tree = renderHook(() => useAccountTree(fixtureRows())).result.current
        const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        return render(
            <QueryClientProvider client={client}>
                <OverlayProvider>
                    <PortalHost>
                        <AccountsScreenView
                            isReady
                            isWide={isWide}
                            canWrite
                            isError={false}
                            tree={tree}
                            {...viewProps()}
                            onOpen={vi.fn()}
                            onNew={vi.fn()}
                            onRetry={vi.fn()}
                        />
                    </PortalHost>
                </OverlayProvider>
            </QueryClientProvider>
        )
    }

    // The test renderer keeps accessibilityState as an object prop, so read the React props.
    function isSelected(el: Element | null) {
        const key = el && Object.keys(el).find(k => k.startsWith('__reactProps$'))
        const props = (key ? (el as unknown as Record<string, unknown>)[key] : {}) as {
            accessibilityState?: { selected?: boolean }
        }
        return props.accessibilityState?.selected === true
    }

    function tinted(el: Element | null) {
        return classOf(el)
            .split(/\s+/)
            .some(c => /^bg-/.test(c) && c !== 'bg-background')
    }

    it('selects and tints the row of the account open in the edit panel, and clears on close', async () => {
        const { container } = renderWithPanel(true)
        const row = () => byTestId(container, 'account-row-acct_bank_0002')
        const other = () => byTestId(container, 'account-row-acct_bank_0001')
        expect(isSelected(row())).toBe(false)

        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0002'))

        expect(isSelected(row())).toBe(true)
        expect(tinted(row())).toBe(true)
        expect(isSelected(other())).toBe(false)
        expect(tinted(other())).toBe(false)

        act(() => useAccountsPanelStore.getState().close())

        expect(isSelected(row())).toBe(false)
        expect(tinted(row())).toBe(false)
    })

    it('moves the selection when another account is opened', () => {
        const { container } = renderWithPanel(true)
        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0002'))
        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0001'))

        expect(isSelected(byTestId(container, 'account-row-acct_bank_0001'))).toBe(true)
        expect(isSelected(byTestId(container, 'account-row-acct_bank_0002'))).toBe(false)
    })

    it.each([
        ['new account', { mode: 'new', parentId: '', seq: 0 }],
        ['new sub-account', { mode: 'new', parentId: 'acct_bank_0001', seq: 0 }],
    ] as const)('selects no row in %s mode', (_label, target) => {
        const { container } = renderWithPanel(true)
        act(() => useAccountsPanelStore.setState({ target }))

        const rowEls = container.querySelectorAll(
            '[testID^="account-row-"], [testid^="account-row-"]'
        )
        expect(rowEls.length).toBeGreaterThan(1)
        for (const el of Array.from(rowEls)) {
            expect(isSelected(el)).toBe(false)
            expect(tinted(el)).toBe(false)
        }
    })

    it('selects and tints the card of the open account on a non-wide screen', () => {
        const { container } = renderWithPanel(false)
        act(() => useAccountsPanelStore.getState().openEdit('acct_bank_0002'))

        const card = byTestId(container, 'account-card-acct_bank_0002')
        expect(isSelected(card)).toBe(true)
        expect(tinted(card)).toBe(true)
        expect(isSelected(byTestId(container, 'account-card-acct_bank_0001'))).toBe(false)
    })
})
