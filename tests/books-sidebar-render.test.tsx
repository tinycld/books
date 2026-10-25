// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BooksSidebar from '../tinycld/books/sidebar'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { seedBooks } from './accounts-form-harness'

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
        seedBooks({ level: 'admin' })
        useBooksUIStore.setState({ isAccountingOpen: true })
        url.pathname = '/'
    })

    it('draws the Settings entry last', () => {
        const { container } = render(<BooksSidebar />)
        const ids = items(container).map(i => i.id)
        expect(ids).toContain('books-nav-settings')
        expect(ids[ids.length - 1]).toBe('books-nav-settings')
    })

    it('draws Settings last even when Accounting is folded', () => {
        useBooksUIStore.setState({ isAccountingOpen: false })
        const { container } = render(<BooksSidebar />)
        const ids = items(container).map(i => i.id)
        expect(ids[ids.length - 1]).toBe('books-nav-settings')
    })

    it.each([
        '/a/books/settings',
        '/a/books/settings/company',
    ])('marks only Settings active on %s', pathname => {
        url.pathname = pathname
        const { container } = render(<BooksSidebar />)
        const active = items(container)
            .filter(i => i.isActive)
            .map(i => i.id)
        expect(active).toEqual(['books-nav-settings'])
    })
})
