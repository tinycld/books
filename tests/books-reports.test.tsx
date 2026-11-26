// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sortBooksReports, useBooksReports } from '../tinycld/books/hooks/useBooksReports'
import {
    BALANCE_SHEET,
    MY_SALES,
    PROFIT_AND_LOSS,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

describe('sortBooksReports', () => {
    it('puts the shipped reports first, each group by title', () => {
        const sorted = sortBooksReports([
            { id: '1', title: 'Zebra', shippedKey: '' },
            { id: '2', title: 'Profit and Loss', shippedKey: 'books.profit_and_loss' },
            { id: '3', title: 'Alpha', shippedKey: '' },
            { id: '4', title: 'Balance Sheet', shippedKey: 'books.balance_sheet' },
        ])
        expect(sorted.map(report => [report.title, report.isShipped])).toEqual([
            ['Balance Sheet', true],
            ['Profit and Loss', true],
            ['Alpha', false],
            ['Zebra', false],
        ])
    })

    it('orders the shipped reports by group: Overview, Sales, Expenses, then Accounting', () => {
        const sorted = sortBooksReports([
            { id: '1', title: 'Trial Balance', shippedKey: 'books.trial_balance' },
            { id: '2', title: 'A/P Aging', shippedKey: 'books.ap_aging' },
            { id: '3', title: 'A/R Aging', shippedKey: 'books.ar_aging' },
            { id: '4', title: 'Profit and Loss', shippedKey: 'books.profit_and_loss' },
            { id: '5', title: 'My report', shippedKey: '' },
        ])
        expect(sorted.map(report => [report.title, report.group])).toEqual([
            ['Profit and Loss', 'overview'],
            ['A/R Aging', 'sales'],
            ['A/P Aging', 'expenses'],
            ['Trial Balance', 'accounting'],
            ['My report', 'saved'],
        ])
    })

    it('keeps two reports of one title in a fixed order', () => {
        const rows = [
            { id: 'b', title: 'Same', shippedKey: '' },
            { id: 'a', title: 'Same', shippedKey: '' },
        ]
        expect(sortBooksReports(rows).map(report => report.id)).toEqual(['a', 'b'])
        expect(sortBooksReports([...rows].reverse()).map(report => report.id)).toEqual(['a', 'b'])
    })
})

describe('useBooksReports', () => {
    it('lists the Books reports only, shipped first', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { result } = renderHook(() => useBooksReports())

        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.reports).toEqual([
            {
                id: BALANCE_SHEET.id,
                title: 'Balance Sheet',
                shippedKey: 'books.balance_sheet',
                isShipped: true,
                group: 'overview',
            },
            {
                id: PROFIT_AND_LOSS.id,
                title: 'Profit and Loss',
                shippedKey: 'books.profit_and_loss',
                isShipped: true,
                group: 'overview',
            },
            {
                id: MY_SALES.id,
                title: 'My sales by month',
                shippedKey: '',
                isShipped: false,
                group: 'saved',
            },
        ])
        expect(result.current.isError).toBe(false)
        expect(result.current.recovery).toEqual({ queries: [], sources: [] })
    })

    it('is an empty list for a reader with no Books report', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { result } = renderHook(() => useBooksReports())

        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.reports).toEqual([])
    })
})
