// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBooksReportState } from '../tinycld/books/hooks/useBooksReportState'
import {
    BOOKS_HUB_PARAMS,
    BOOKS_REPORT_BASE,
    BOOKS_REPORT_ROUTE,
    booksReportState,
    REPORTS_HUB_ROUTE,
} from '../tinycld/books/lib/books-report-route'
import { hidesNewFab } from '../tinycld/books/lib/shell-nav'
import { onDemandStore, seedBooks } from './accounts-form-harness'
import { MY_SALES, PROFIT_AND_LOSS, type SeedReport, ZOO_REPORT } from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

function seedReports(rows: SeedReport[], refuseOnceFor?: string) {
    seedBooks({ level: 'admin' })
    return onDemandStore<SeedReport>('reports', rows, refuseOnceFor)
}

describe('the Books report routes', () => {
    it('are under books/reports, and the hub lists only Books reports', () => {
        expect(BOOKS_REPORT_BASE).toBe('books/reports')
        expect(BOOKS_REPORT_ROUTE).toBe(`${BOOKS_REPORT_BASE}/[id]`)
        expect(REPORTS_HUB_ROUTE).toBe('reports')
        expect(BOOKS_HUB_PARAMS).toEqual({ package: 'books' })
    })

    it('keep the round New button off a report and on no other reports path', () => {
        expect(hidesNewFab('/a/books/reports/rptprofitloss01')).toBe(true)
        expect(hidesNewFab('/a/books/reports')).toBe(false)
    })
})

describe('booksReportState', () => {
    it('draws the report view for a Books report', () => {
        expect(booksReportState({ source: 'books.account_balances' })).toBe('report')
    })

    it('draws the report view when there is no row: loading, failed, no access, deleted', () => {
        expect(booksReportState(undefined)).toBe('report')
    })

    it('is foreign only for a loaded row of another package', () => {
        expect(booksReportState({ source: 'zoo.feedings' })).toBe('foreign')
        expect(booksReportState({ source: 'booksish.x' })).toBe('foreign')
        expect(booksReportState({ source: '' })).toBe('foreign')
    })
})

describe('useBooksReportState', () => {
    it('is report for a shipped and for a saved Books report', async () => {
        const store = seedReports([PROFIT_AND_LOSS, MY_SALES, ZOO_REPORT])
        const shipped = renderHook(() => useBooksReportState(PROFIT_AND_LOSS.id))
        const saved = renderHook(() => useBooksReportState(MY_SALES.id))

        await waitFor(() => expect(store.has(MY_SALES.id)).toBe(true))
        expect(shipped.result.current).toBe('report')
        expect(saved.result.current).toBe('report')
    })

    it('is foreign for a loaded report of another package', async () => {
        seedReports([PROFIT_AND_LOSS, ZOO_REPORT])
        const { result } = renderHook(() => useBooksReportState(ZOO_REPORT.id))

        await waitFor(() => expect(result.current).toBe('foreign'))
    })

    it('stays report for an id with no row', async () => {
        const store = seedReports([PROFIT_AND_LOSS])
        const known = renderHook(() => useBooksReportState(PROFIT_AND_LOSS.id))
        const unknown = renderHook(() => useBooksReportState('rptgone00000001'))

        await waitFor(() => expect(store.has(PROFIT_AND_LOSS.id)).toBe(true))
        expect(known.result.current).toBe('report')
        expect(unknown.result.current).toBe('report')
    })

    it('stays report when the read of the row fails', async () => {
        const store = seedReports([ZOO_REPORT], ZOO_REPORT.id)
        expectLiveQueryError(store.id)
        const { result } = renderHook(() => useBooksReportState(ZOO_REPORT.id))

        await waitFor(() => expect(store.status).toBe('ready'))
        expect(result.current).toBe('report')
    })
})
