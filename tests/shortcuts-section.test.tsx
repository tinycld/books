// @vitest-environment happy-dom
import { fireEvent, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shortcutTestId } from '../tinycld/books/lib/shortcut-rows'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import { ME, onDemandStore, storedAccounts } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    renderSidebar,
    seedSidebar,
    shortcutsRow,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/customers', params: {}, href: '/a/books/customers' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const DEFAULT_IDS = [
    'books-shortcut-screen-customers',
    'books-shortcut-screen-vendors',
    'books-shortcut-screen-products',
    'books-shortcut-report-books-profit-and-loss',
    'books-shortcut-report-books-balance-sheet',
]

async function shortcutIds(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, 'books-shortcut-')).toHaveLength(count))
    return idsWith(container, 'books-shortcut-')
}

beforeEach(() => {
    vi.mocked(router.navigate).mockClear()
})

describe('Shortcuts section', () => {
    it('draws the default shortcuts for a user with no stored list', async () => {
        seedSidebar()
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 5)).toEqual(DEFAULT_IDS)
        expect(
            byTestId(container, 'books-shortcut-report-books-profit-and-loss')?.textContent
        ).toBe('Profit and Loss')
    })

    it('draws the stored list in its order, one row for each kind', async () => {
        const [account] = storedAccountsAfterSeed()
        const registerId = shortcutTestId({ kind: 'register', ref: account.id })
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 4)).toEqual([
            registerId,
            'books-shortcut-new-invoice',
            `books-shortcut-report-${MY_SALES.id}`,
            'books-shortcut-screen-vendors',
        ])
        expect(byTestId(container, registerId)?.textContent).toContain(account.name)
        expect(byTestId(container, 'books-shortcut-new-invoice')?.textContent).toBe('New invoice')
    })

    it('opens the route of a pressed shortcut', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        fireEvent.click(byTestId(container, 'books-shortcut-screen-vendors') as HTMLElement)
        fireEvent.click(
            byTestId(container, 'books-shortcut-report-books-balance-sheet') as HTMLElement
        )

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            '/a/books/vendors',
            { pathname: '/a/reports/[id]', params: { id: BALANCE_SHEET.id } },
        ])
    })

    it('marks no shortcut active, also on the screen it opens', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        const label = byTestId(container, 'books-shortcut-screen-customers')?.querySelector(
            'rn-text'
        )
        expect(label?.getAttribute('class')).not.toContain('font-semibold')
    })

    it('says so when the user removed every shortcut, and draws no default', async () => {
        seedSidebar({ shortcuts: [] })
        const { container } = renderSidebar()

        await waitFor(() => expect(byTestId(container, 'books-shortcuts-empty')).not.toBeNull())
        expect(idsWith(container, 'books-shortcut-')).toEqual([])
    })

    it('leaves out a report the reader cannot open and a form for a reader', async () => {
        seedSidebar({
            level: 'read_only',
            reports: [PROFIT_AND_LOSS],
            shortcuts: [
                { kind: 'new', ref: 'invoice' },
                { kind: 'report', ref: 'books.balance_sheet' },
                { kind: 'report', ref: 'books.profit_and_loss' },
            ],
        })
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 1)).toEqual([
            'books-shortcut-report-books-profit-and-loss',
        ])
        expect(byTestId(container, 'books-shortcuts-empty')).toBeNull()
    })

    it('draws the fixed navigation under a Go to heading, after the shortcuts', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        const headings = [...container.querySelectorAll('rn-text')]
            .map(node => node.textContent)
            .filter(text => text === 'Shortcuts' || text === 'Go to' || text === 'Accounting')
        expect(headings).toEqual(['Shortcuts', 'Go to', 'Accounting'])
        const lastShortcut = byTestId(container, DEFAULT_IDS[4]) as HTMLElement
        const dashboard = byTestId(container, 'books-nav-dashboard') as HTMLElement
        expect(
            lastShortcut.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('shows an error with Retry, not the defaults, when the list cannot be read', async () => {
        seedSidebar()
        const store = onDemandStore<BooksSidebarShortcuts>(
            'books_sidebar_shortcuts',
            [shortcutsRow([{ kind: 'screen', ref: 'vendors' }])],
            { field: 'user', value: ME }
        )
        expectLiveQueryError(store.id)
        const { container } = renderSidebar()

        await waitFor(() => expect(byTestId(container, 'books-shortcuts-error')).not.toBeNull())
        expect(idsWith(container, 'books-shortcut-')).toEqual([])
        expect(byTestId(container, 'books-nav-dashboard')).not.toBeNull()

        fireEvent.click(byTestId(container, 'books-shortcuts-retry') as HTMLElement)

        expect(await shortcutIds(container, 1)).toEqual(['books-shortcut-screen-vendors'])
        expect(byTestId(container, 'books-shortcuts-error')).toBeNull()
    })
})

// Seeds a list with one shortcut of each kind; the register is the first seeded account.
function storedAccountsAfterSeed() {
    seedSidebar({ reports: [PROFIT_AND_LOSS, MY_SALES] })
    const accounts = storedAccounts()
    seedSidebar({
        reports: [PROFIT_AND_LOSS, MY_SALES],
        shortcuts: [
            { kind: 'register', ref: accounts[0].id },
            { kind: 'new', ref: 'invoice' },
            { kind: 'report', ref: MY_SALES.id },
            { kind: 'screen', ref: 'vendors' },
        ],
    })
    return accounts
}
