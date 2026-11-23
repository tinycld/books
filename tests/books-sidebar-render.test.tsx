// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { renderSidebar, seedSidebar } from './sidebar-harness'

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
        useBooksUIStore.setState({ isAccountingOpen: true })
        url.pathname = '/'
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
