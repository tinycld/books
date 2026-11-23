// @vitest-environment happy-dom
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewFab } from '../tinycld/books/components/NewFab'
import { NEW_ACTIONS } from '../tinycld/books/lib/new-actions'
import BooksSidebar from '../tinycld/books/sidebar'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { byTestId } from './accounts-test-rows'
import { idsWith, renderSidebar, SidebarProviders, seedSidebar } from './sidebar-harness'

const url = vi.hoisted(() => ({ pathname: '/a/books/entries' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

function toggle(container: HTMLElement) {
    return byTestId(container, 'books-sidebar-new-toggle')
}

beforeEach(() => {
    useBooksUIStore.setState({ isNewOpen: false })
    useWorkspaceStore.setState({ isDrawerOpen: false })
    useWindowSizeStore.setState(DESKTOP)
    url.pathname = '/a/books/entries'
    vi.mocked(router.push).mockClear()
})

describe('New section', () => {
    it('is folded at first: the heading with its button, and no action', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()

        await waitFor(() => expect(toggle(container)).not.toBeNull())
        expect(toggle(container)?.getAttribute('accessibilitylabel')).toBe('Expand New')
        expect(idsWith(container, 'books-sidebar-new-group-')).toEqual([])
    })

    it('opens to the three groups with every action, in the order of the registry', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()
        await waitFor(() => expect(toggle(container)).not.toBeNull())

        fireEvent.click(toggle(container) as HTMLElement)

        expect(toggle(container)?.getAttribute('accessibilitylabel')).toBe('Collapse New')
        expect(idsWith(container, 'books-sidebar-new-group-')).toEqual([
            'books-sidebar-new-group-customers',
            'books-sidebar-new-group-vendors',
            'books-sidebar-new-group-other',
        ])
        const items = idsWith(container, 'books-sidebar-new-').filter(
            id => !id.startsWith('books-sidebar-new-group-') && id !== 'books-sidebar-new-toggle'
        )
        expect(items).toEqual(
            NEW_ACTIONS.map(action => `books-sidebar-new-${action.id.replace(/_/g, '-')}`)
        )
        expect(items.some(id => id.includes('_'))).toBe(false)
        // An action is a direct child of its group, and the group names itself.
        const invoice = byTestId(container, 'books-sidebar-new-invoice') as HTMLElement
        expect(invoice.parentElement?.getAttribute('testid')).toBe(
            'books-sidebar-new-group-customers'
        )
        expect(invoice.parentElement?.textContent).toContain('Customers')
        expect(invoice.textContent).toBe('Invoice')
    })

    it('opens the form of a pressed action', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()
        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-new-sales-receipt')).not.toBeNull()
        )

        fireEvent.click(byTestId(container, 'books-sidebar-new-sales-receipt') as HTMLElement)

        expect(vi.mocked(router.push).mock.calls.map(call => call[0])).toEqual([
            '/a/books/sales-receipts/new',
        ])
    })

    it('keeps the fold state across remounts', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const first = renderSidebar()
        await waitFor(() => expect(toggle(first.container)).not.toBeNull())
        fireEvent.click(toggle(first.container) as HTMLElement)
        first.unmount()

        const second = renderSidebar()

        await waitFor(() =>
            expect(byTestId(second.container, 'books-sidebar-new-invoice')).not.toBeNull()
        )
    })

    it('stands between the shortcuts and the fixed navigation', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()
        await waitFor(() =>
            expect(byTestId(container, 'books-shortcut-screen-customers')).not.toBeNull()
        )

        const shortcut = byTestId(container, 'books-shortcut-screen-customers') as HTMLElement
        const fold = toggle(container) as HTMLElement
        const dashboard = byTestId(container, 'books-nav-dashboard') as HTMLElement
        expect(
            shortcut.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(
            fold.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('is not drawn for a reader, open or not', async () => {
        seedSidebar({ level: 'read_only' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-shortcut-screen-customers')).not.toBeNull()
        )
        expect(idsWith(container, 'books-sidebar-new-')).toEqual([])
    })

    it('leaves no popover trigger and no popover item in the sidebar', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()
        await waitFor(() => expect(toggle(container)).not.toBeNull())

        expect(idsWith(document.body, 'books-new-')).toEqual([])
        // "New" is drawn one time: the section's heading.
        const news = [...container.querySelectorAll('rn-text')].filter(
            node => node.textContent === 'New'
        )
        expect(news).toHaveLength(1)
    })
})

describe('NewFab', () => {
    function renderFab() {
        return render(<NewFab />, { wrapper: SidebarProviders })
    }

    function fab() {
        return document.body.querySelector('[accessibilitylabel="New"]')
    }

    it('opens the drawer with the New section open, on a phone', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        fireEvent.click(fab() as HTMLElement)

        expect(useWorkspaceStore.getState().isDrawerOpen).toBe(true)
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('opens the section and never closes one that is open', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        useBooksUIStore.setState({ isNewOpen: true })
        renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        fireEvent.click(fab() as HTMLElement)

        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    // Each case first draws the button for a bookkeeper on a phone list route, so the access
    // data is loaded, then changes one condition: the button must go.
    it('is not drawn once the window is wide', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        act(() => useWindowSizeStore.setState(DESKTOP))

        await waitFor(() => expect(fab()).toBeNull())
    })

    it('is not drawn on a form', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        const view = renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        url.pathname = '/a/books/invoices/new'
        view.rerender(<NewFab />)

        await waitFor(() => expect(fab()).toBeNull())
    })

    it('is not drawn for a reader', async () => {
        seedSidebar({ level: 'read_only' })
        useWindowSizeStore.setState(PHONE)
        // The sidebar reads the same access data: its rows show that the data is loaded.
        const { container } = render(
            <>
                <NewFab />
                <BooksSidebar />
            </>,
            { wrapper: SidebarProviders }
        )
        await waitFor(() =>
            expect(byTestId(container, 'books-shortcut-screen-customers')).not.toBeNull()
        )

        expect(fab()).toBeNull()
    })
})
