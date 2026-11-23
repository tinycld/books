// @vitest-environment happy-dom
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { idsWith, renderSidebar, seedSidebar } from './sidebar-harness'

const url = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function items(container: HTMLElement) {
    return [...container.querySelectorAll('[testid^="books-nav-"]')]
        .filter(node => node.getAttribute('testid') !== 'books-nav-accounting-toggle')
        .map(node => ({
            id: node.getAttribute('testid'),
            // SidebarItem tints the label with the active-indicator colour only when active.
            isActive: node
                .querySelector('rn-text')
                ?.getAttribute('class')
                ?.includes('font-semibold'),
        }))
}

describe('BooksSidebar rendering', () => {
    beforeEach(() => {
        seedSidebar()
        useBooksUIStore.setState({ isAccountingOpen: true, isNewFirst: false })
        useWindowSizeStore.getState().setSize(1280, 800)
        url.pathname = '/'
    })

    describe('the order of Shortcuts and New', () => {
        const heads = ['books-shortcuts-customize', 'books-sidebar-new-toggle']

        function leadOrder() {
            const { container } = renderSidebar()
            return idsWith(container, 'books-').filter(id => heads.includes(id))
        }

        it('draws New first on a phone, when the New button opened the drawer', () => {
            useWindowSizeStore.getState().setSize(390, 844)
            useBooksUIStore.setState({ isNewFirst: true })
            expect(leadOrder()).toEqual([heads[1], heads[0]])
        })

        it('draws Shortcuts first on a phone, when the drawer opened otherwise', () => {
            useWindowSizeStore.getState().setSize(390, 844)
            expect(leadOrder()).toEqual(heads)
        })

        it('draws Shortcuts first on a desktop, also with the flag left set by a resize', () => {
            useWindowSizeStore.getState().setSize(1280, 800)
            useBooksUIStore.setState({ isNewFirst: true })
            expect(leadOrder()).toEqual(heads)
        })
    })

    it('draws the Settings entry last', () => {
        const { container } = renderSidebar()
        const ids = items(container).map(i => i.id)
        expect(ids).toContain('books-nav-settings')
        expect(ids[ids.length - 1]).toBe('books-nav-settings')
    })

    it('draws Settings last even when Accounting is folded', () => {
        useBooksUIStore.setState({ isAccountingOpen: false })
        const { container } = renderSidebar()
        const ids = items(container).map(i => i.id)
        expect(ids[ids.length - 1]).toBe('books-nav-settings')
    })

    it('draws Dashboard, Banking, Sales, Expenses, then Lists', () => {
        const { container } = renderSidebar()
        const ids = items(container).map(i => i.id)
        expect(ids.slice(0, 5)).toEqual([
            'books-nav-dashboard',
            'books-nav-banking',
            'books-nav-sales',
            'books-nav-expenses',
            'books-nav-lists',
        ])
    })

    it('marks only Expenses active on a bill', () => {
        url.pathname = '/a/books/bills/x'
        const { container } = renderSidebar()
        const active = items(container)
            .filter(i => i.isActive)
            .map(i => i.id)
        expect(active).toEqual(['books-nav-expenses'])
    })

    it.each([
        '/a/books/sales',
        '/a/books/invoices',
        '/a/books/invoices/abc',
        '/a/books/payments/new',
        '/a/books/credit-memos/abc',
    ])('marks only Sales active on %s', pathname => {
        url.pathname = pathname
        const { container } = renderSidebar()
        const active = items(container)
            .filter(i => i.isActive)
            .map(i => i.id)
        expect(active).toEqual(['books-nav-sales'])
    })

    it.each([
        '/a/books/settings',
        '/a/books/settings/company',
    ])('marks only Settings active on %s', pathname => {
        url.pathname = pathname
        const { container } = renderSidebar()
        const active = items(container)
            .filter(i => i.isActive)
            .map(i => i.id)
        expect(active).toEqual(['books-nav-settings'])
    })
})
