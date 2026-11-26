// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportsSection } from '../tinycld/books/components/sidebar/ReportsSection'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { heldOnDemandStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    renderSidebar,
    type SeedReport,
    SidebarProviders,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

const url = vi.hoisted(() => ({ pathname: '/a/books/dashboard' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const ROW = 'books-sidebar-report-'
const ALL = 'books-sidebar-reports-all'

function toggle(container: HTMLElement) {
    return byTestId(container, 'books-sidebar-reports-toggle') as HTMLElement
}

// The Reports rows in document order: the report rows, then the All reports row.
function reportRows(container: HTMLElement) {
    return idsWith(container, 'books-sidebar-report').filter(id => id.startsWith(ROW) || id === ALL)
}

async function openRows(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, ROW)).toHaveLength(count))
}

beforeEach(() => {
    useBooksUIStore.setState({ isNewOpen: false, isReportsOpen: true })
    url.pathname = '/a/books/dashboard'
    vi.mocked(router.navigate).mockClear()
})

describe('Reports section', () => {
    it('is folded until the user opens it, and the fold button says what a press does', () => {
        useBooksUIStore.setState({ isReportsOpen: false })
        seedSidebar()
        const { container } = renderSidebar()

        expect(toggle(container).getAttribute('accessibilitylabel')).toBe('Expand Reports')
        expect(reportRows(container)).toEqual([])

        fireEvent.click(toggle(container))

        expect(toggle(container).getAttribute('accessibilitylabel')).toBe('Collapse Reports')
        expect(useBooksUIStore.getState().isReportsOpen).toBe(true)
        expect(reportRows(container)).toContain(ALL)
    })

    it('lists the Books reports, shipped first, then All reports, and no report of another package', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { container } = renderSidebar()
        await openRows(container, 3)

        expect(reportRows(container)).toEqual([
            `${ROW}${BALANCE_SHEET.id}`,
            `${ROW}${PROFIT_AND_LOSS.id}`,
            `${ROW}${MY_SALES.id}`,
            ALL,
        ])
        expect(byTestId(container, `${ROW}${MY_SALES.id}`)?.textContent).toBe('My sales by month')
        expect(byTestId(container, ALL)?.textContent).toBe('All reports')
    })

    it('sits after the fixed navigation and the New section', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        const before = (first: string, second: string) =>
            (byTestId(container, first) as HTMLElement).compareDocumentPosition(
                byTestId(container, second) as HTMLElement
            ) & Node.DOCUMENT_POSITION_FOLLOWING
        expect(before('books-nav-settings', 'books-sidebar-new-toggle')).toBeTruthy()
        expect(before('books-sidebar-new-toggle', 'books-sidebar-reports-toggle')).toBeTruthy()
        expect(byTestId(container, 'books-nav-reports')).toBeNull()
    })

    it('opens a report on the Books route and All reports on the hub with the Books filter', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        fireEvent.click(byTestId(container, `${ROW}${PROFIT_AND_LOSS.id}`) as HTMLElement)
        fireEvent.click(byTestId(container, ALL) as HTMLElement)

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            { pathname: '/a/books/reports/[id]', params: { id: PROFIT_AND_LOSS.id } },
            { pathname: '/a/reports', params: { package: 'books' } },
        ])
    })

    it('marks the report that is open, and no other row', async () => {
        url.pathname = `/a/books/reports/${BALANCE_SHEET.id}`
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        const isMarked = (id: string) =>
            byTestId(container, id)
                ?.querySelector('rn-text')
                ?.getAttribute('class')
                ?.includes('font-semibold')
        expect(isMarked(`${ROW}${BALANCE_SHEET.id}`)).toBe(true)
        expect(isMarked(`${ROW}${PROFIT_AND_LOSS.id}`)).toBe(false)
        expect(isMarked(ALL)).toBe(false)
    })

    it('shows the section to a reader', async () => {
        seedSidebar({ level: 'read_only' })
        const { container } = renderSidebar()
        await openRows(container, 2)

        expect(byTestId(container, 'books-sidebar-new-toggle')).toBeNull()
        expect(reportRows(container)).toHaveLength(3)
    })

    it('says so when there is no Books report, and still offers All reports', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-empty')?.textContent).toBe(
                'No reports'
            )
        )
        expect(reportRows(container)).toEqual([ALL])
    })

    it('shows Loading while the reports load', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS])
        store.hold()
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-loading')).not.toBeNull()
        )
        expect(byTestId(container, 'books-sidebar-reports-empty')).toBeNull()
        expect(reportRows(container)).toEqual([ALL])

        store.release()

        await openRows(container, 1)
        expect(byTestId(container, 'books-sidebar-reports-loading')).toBeNull()
    })

    it('shows an error with Retry, not an empty list, when the reports cannot be read', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(store.id)
        // The section alone: the store refuses one load, and in the whole sidebar the
        // Shortcuts section's own read of the reports would take the refusal.
        const { container } = render(<ReportsSection />, { wrapper: SidebarProviders })

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-error')).not.toBeNull()
        )
        expect(byTestId(container, 'books-sidebar-reports-empty')).toBeNull()
        expect(reportRows(container)).toEqual([ALL])

        fireEvent.click(byTestId(container, 'books-sidebar-reports-retry') as HTMLElement)

        await openRows(container, 1)
        expect(byTestId(container, 'books-sidebar-reports-error')).toBeNull()
    })
})
