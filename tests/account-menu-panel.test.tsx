// @vitest-environment happy-dom
import { OverlayProvider as PortalHost } from '@gluestack-ui/core/overlay/creator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsScreenView } from '../tinycld/books/components/accounts/AccountsScreenView'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { useAccountsPanelStore } from '../tinycld/books/stores/accounts-panel-store'
import { seedBooks } from './accounts-form-harness'
import { byTestId, fixtureRows } from './accounts-test-rows'
import { viewProps } from './accounts-view-props'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ID = 'acct_bank_0001'

function target() {
    return useAccountsPanelStore.getState().target
}

// The real panel store backs onOpen, onEdit and onAddSub, so a press that
// reaches the row underneath shows up as an edit target.
function renderScreen(isWide: boolean, over: Parameters<typeof viewProps>[0] = {}) {
    const store = useAccountsPanelStore.getState()
    const props = viewProps(over)
    const menu = { ...props.menu, onEdit: store.openEdit, onAddSub: store.openSubAccount }
    const tree = renderHook(() => useAccountTree(fixtureRows())).result.current
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const view = render(
        <QueryClientProvider client={client}>
            <OverlayProvider>
                <PortalHost>
                    <AccountsScreenView
                        isReady
                        isWide={isWide}
                        canWrite
                        isError={false}
                        tree={tree}
                        {...props}
                        menu={menu}
                        onOpen={store.openEdit}
                        onNew={store.openNew}
                        onRetry={vi.fn()}
                    />
                </PortalHost>
            </OverlayProvider>
        </QueryClientProvider>
    )
    return { ...view, menu }
}

function openMenu(container: HTMLElement) {
    fireEvent.click(byTestId(container, `account-menu-${ID}`) as HTMLElement)
}

describe.each([
    ['wide', true],
    ['phone', false],
])('row menu item presses on %s do not open the panel behind', (_name, isWide) => {
    beforeEach(() => {
        seedBooks()
        act(() => useAccountsPanelStore.setState({ target: null }))
    })

    it('Delete fires onDelete and opens no panel', () => {
        const { container, menu } = renderScreen(isWide)
        openMenu(container)
        fireEvent.click(screen.getByText('Delete'))
        expect(menu.onDelete).toHaveBeenCalledWith(ID)
        expect(target()).toBeNull()
    })

    it('Make inactive fires onToggleInactive and opens no panel', () => {
        const { container, menu } = renderScreen(isWide)
        openMenu(container)
        fireEvent.click(screen.getByText('Make inactive'))
        expect(menu.onToggleInactive).toHaveBeenCalledTimes(1)
        expect(target()).toBeNull()
    })

    it('Add sub-account opens only the new sub-account panel', () => {
        const { container } = renderScreen(isWide)
        openMenu(container)
        fireEvent.click(screen.getByText('Add sub-account'))
        expect(target()).toMatchObject({ mode: 'new', parentId: ID })
        expect(target()?.mode).not.toBe('edit')
    })

    it('Edit opens the edit panel for that row', () => {
        const { container } = renderScreen(isWide)
        openMenu(container)
        fireEvent.click(screen.getByText('Edit'))
        expect(target()).toMatchObject({ mode: 'edit', id: ID })
    })

    it('View register fires onViewRegister with the id and opens no panel', () => {
        const { container, menu } = renderScreen(isWide)
        openMenu(container)
        fireEvent.click(screen.getByText('View register'))
        expect(menu.onViewRegister).toHaveBeenCalledWith(ID)
        expect(target()).toBeNull()
    })

    it('pressing the menu trigger opens no panel', () => {
        const { container } = renderScreen(isWide)
        openMenu(container)
        expect(target()).toBeNull()
    })

    it('pressing the checkbox opens no panel', () => {
        const { container } = renderScreen(isWide)
        fireEvent.click(byTestId(container, `account-select-${ID}`) as HTMLElement)
        expect(target()).toBeNull()
    })
})

describe.each([
    ['writer', 'bookkeeper'],
    ['read-only user', 'read_only'],
] as const)('the edit panel View register button for a %s', (_name, level) => {
    beforeEach(() => {
        seedBooks({ level })
        act(() => useAccountsPanelStore.setState({ target: null }))
    })

    it('calls onViewRegister with the account id', async () => {
        const { menu } = renderScreen(true)
        act(() => useAccountsPanelStore.getState().openEdit(ID))
        const button = await waitFor(() => {
            const el = byTestId(document.body, 'account-panel-view-register')
            expect(el).not.toBeNull()
            return el as HTMLElement
        })
        fireEvent.click(button)
        expect(menu.onViewRegister).toHaveBeenCalledWith(ID)
    })
})

describe('the refusal message is shown once', () => {
    const MESSAGE = 'This account is in use.'
    const free = fixtureRows().find(r => r.id === 'acct_cc_00001') ?? null

    beforeEach(() => {
        seedBooks()
    })

    it('shows it only in the dialog while the delete dialog is open', async () => {
        renderScreen(true, { actionError: MESSAGE, deleteTarget: free })
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        expect(screen.getAllByText(MESSAGE)).toHaveLength(1)
        expect(byTestId(document.body, 'accounts-action-error')).toBeNull()
        expect(
            screen
                .getByText(MESSAGE)
                .closest(
                    '[testID="delete-account-dialog-body"], [testid="delete-account-dialog-body"]'
                )
        ).not.toBeNull()
    })

    it('shows it once in the page banner when no dialog is open', () => {
        const { container } = renderScreen(true, { actionError: MESSAGE })
        expect(screen.getAllByText(MESSAGE)).toHaveLength(1)
        expect(byTestId(container, 'accounts-action-error')).not.toBeNull()
    })
})
