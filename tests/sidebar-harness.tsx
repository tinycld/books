import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import type { ReactNode } from 'react'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import BooksSidebar from '../tinycld/books/sidebar'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import { guardedStore, ME, seedBooks } from './accounts-form-harness'

// What the sidebar tests share: the stores the Books sidebar reads, and its render inside
// the providers its hooks need. The test file mocks `@tinycld/core/lib/pocketbase`
// (useStoreStub), `@tinycld/core/lib/auth` (user u1) and `@tinycld/core/lib/use-url`.

const STAMP = '2026-11-01 00:00:00.000Z'

export interface SeedReport {
    id: string
    title: string
    source: string
    shipped_key: string
}

export const PROFIT_AND_LOSS: SeedReport = {
    id: 'rptprofitloss01',
    title: 'Profit and Loss',
    source: 'books.account_balances',
    shipped_key: 'books.profit_and_loss',
}
export const BALANCE_SHEET: SeedReport = {
    id: 'rptbalancesht01',
    title: 'Balance Sheet',
    source: 'books.account_balances',
    shipped_key: 'books.balance_sheet',
}
// A saved report: no shipped key.
export const MY_SALES: SeedReport = {
    id: 'rptmysales00001',
    title: 'My sales by month',
    source: 'books.journal_lines',
    shipped_key: '',
}
// A report of another package: never a Books report.
export const ZOO_REPORT: SeedReport = {
    id: 'rptzoo000000001',
    title: 'Animals fed',
    source: 'zoo.feedings',
    shipped_key: 'zoo.fed',
}

export function shortcutsRow(items: unknown, user = ME): BooksSidebarShortcuts {
    return { id: 'shortcutrow0001', user, items, created: STAMP, updated: STAMP }
}

interface SeedSidebar {
    level?: 'read_only' | 'bookkeeper' | 'admin'
    // The stored list; undefined is a user with no row (the defaults).
    shortcuts?: readonly Shortcut[]
    reports?: readonly SeedReport[]
}

// Seeds Books, the user's shortcut row and the reports. Returns the two stores.
export function seedSidebar({
    level = 'admin',
    shortcuts,
    reports = [PROFIT_AND_LOSS, BALANCE_SHEET],
}: SeedSidebar = {}) {
    seedBooks({ level })
    const rows = shortcuts === undefined ? [] : [shortcutsRow([...shortcuts])]
    return {
        shortcutsStore: guardedStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', rows),
        reportsStore: guardedStore<SeedReport>('reports', [...reports]),
    }
}

export function SidebarProviders({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return (
        <QueryClientProvider client={client}>
            <OverlayProvider>{children}</OverlayProvider>
        </QueryClientProvider>
    )
}

export function renderSidebar() {
    return render(<BooksSidebar />, { wrapper: SidebarProviders })
}

// The test ids of the drawn elements whose id starts with `prefix`, in document order.
export function idsWith(container: ParentNode, prefix: string): string[] {
    return [...container.querySelectorAll(`[testid^="${prefix}"]`)].map(
        node => node.getAttribute('testid') ?? ''
    )
}
