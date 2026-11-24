// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BooksReportsScreen from '../tinycld/books/screens/reports/index'
import { heldOnDemandStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    type SeedReport,
    SidebarProviders,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/reports', params: {}, href: '/a/books/reports' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const ROW = 'books-reports-row-'
const ALL = 'books-reports-all'

function renderScreen() {
    return render(<BooksReportsScreen />, { wrapper: SidebarProviders })
}

// The rows of the screen in document order: the report rows, then the All reports row.
function screenRows(container: HTMLElement) {
    return idsWith(container, 'books-reports-').filter(id => id.startsWith(ROW) || id === ALL)
}

async function shownRows(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, ROW)).toHaveLength(count))
}

beforeEach(() => {
    vi.mocked(router.navigate).mockClear()
    vi.mocked(router.replace).mockClear()
})

describe('Books reports screen', () => {
    it('lists the Books reports, shipped first, then All reports, and no report of another package', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { container } = renderScreen()
        await shownRows(container, 3)

        expect(byTestId(container, 'books-reports-screen')).not.toBeNull()
        expect(screenRows(container)).toEqual([
            `${ROW}${BALANCE_SHEET.id}`,
            `${ROW}${PROFIT_AND_LOSS.id}`,
            `${ROW}${MY_SALES.id}`,
            ALL,
        ])
        // A screen of Books, not a way on to another route.
        expect(vi.mocked(router.replace)).not.toHaveBeenCalled()
        expect(vi.mocked(router.navigate)).not.toHaveBeenCalled()
    })

    it('uses its own test ids, so the sidebar beside it has no element with the same id', async () => {
        seedSidebar()
        const { container } = renderScreen()
        await shownRows(container, 2)

        expect(idsWith(container, 'books-sidebar-')).toEqual([])
    })

    it('opens a report on the Books route and All reports on the hub with the Books filter', async () => {
        seedSidebar()
        const { container } = renderScreen()
        await shownRows(container, 2)

        fireEvent.click(byTestId(container, `${ROW}${PROFIT_AND_LOSS.id}`) as HTMLElement)
        fireEvent.click(byTestId(container, ALL) as HTMLElement)

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            { pathname: '/a/books/reports/[id]', params: { id: PROFIT_AND_LOSS.id } },
            { pathname: '/a/reports', params: { package: 'books' } },
        ])
    })

    it('says so when there is no Books report, and still offers All reports', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { container } = renderScreen()

        await waitFor(() =>
            expect(byTestId(container, 'books-reports-empty')?.textContent).toBe('No reports')
        )
        expect(screenRows(container)).toEqual([ALL])
    })

    it('shows Loading while the reports load', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS])
        store.hold()
        const { container } = renderScreen()

        await waitFor(() => expect(byTestId(container, 'books-reports-loading')).not.toBeNull())
        expect(byTestId(container, 'books-reports-empty')).toBeNull()

        store.release()

        await shownRows(container, 1)
        expect(byTestId(container, 'books-reports-loading')).toBeNull()
    })

    it('shows an error with Retry, not an empty list, when the reports cannot be read', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(store.id)
        const { container } = renderScreen()

        await waitFor(() => expect(byTestId(container, 'books-reports-error')).not.toBeNull())
        expect(byTestId(container, 'books-reports-empty')).toBeNull()
        expect(screenRows(container)).toEqual([ALL])

        fireEvent.click(byTestId(container, 'books-reports-retry') as HTMLElement)

        await shownRows(container, 1)
        expect(byTestId(container, 'books-reports-error')).toBeNull()
    })
})
