// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksSidebar } from '../tinycld/books/hooks/useBooksSidebar'
import { isActivePath, SIDEBAR_ENTRIES, type SidebarEntry } from '../tinycld/books/lib/shell-nav'

const url = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))

const allAvailable: SidebarEntry[] = SIDEBAR_ENTRIES.map(entry => ({ ...entry, available: true }))

describe('useBooksSidebar', () => {
    beforeEach(() => {
        url.pathname = '/'
    })

    const ALL_IDS = [
        'dashboard',
        'banking',
        'sales',
        'expenses',
        'lists',
        'accounts',
        'entries',
        'reconcile',
        'taxes',
        'settings',
    ]

    // Reports is a section of the sidebar (components/sidebar/ReportsSection.tsx), not an
    // entry of the fixed navigation.
    it('lists every entry in sidebar order: the top ones, the accounting ones, then Taxes and Settings', () => {
        const { result } = renderHook(() => useBooksSidebar())
        expect(result.current.entries.map(e => e.id)).toEqual(ALL_IDS)
        expect(SIDEBAR_ENTRIES.some(e => e.id === 'reports')).toBe(false)
    })

    it('leaves out the entries that are not available', () => {
        const entries = allAvailable.map(e =>
            e.group === 'accounting' ? { ...e, available: false } : e
        )
        const { result } = renderHook(() => useBooksSidebar(entries))
        expect(result.current.entries.map(e => e.id)).toEqual(
            ALL_IDS.filter(id => !['accounts', 'entries', 'reconcile'].includes(id))
        )
    })

    it('isActive agrees with isActivePath for the stubbed pathname and marks every entry inactive', () => {
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        for (const entry of allAvailable) {
            expect(result.current.isActive(entry)).toBe(isActivePath('/', entry))
            expect(result.current.isActive(entry)).toBe(false)
        }
    })

    it('isActive is true only for the entry matching the current path', () => {
        url.pathname = '/a/books/lists'
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        for (const entry of allAvailable) {
            expect(result.current.isActive(entry)).toBe(entry.id === 'lists')
        }
    })

    it.each([
        '/a/books/sales',
        '/a/books/invoices',
        '/a/books/estimates/abc',
        '/a/books/sales-receipts/new',
        '/a/books/payments/abc',
        '/a/books/credit-memos',
    ])('marks only Sales active on %s', pathname => {
        url.pathname = pathname
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        const active = allAvailable.filter(e => result.current.isActive(e)).map(e => e.id)
        expect(active).toEqual(['sales'])
    })

    it.each([
        '/a/books/purchases',
        '/a/books/pay-bills',
        '/a/books/bills/x',
    ])('marks only Expenses active on %s', pathname => {
        url.pathname = pathname
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        const active = allAvailable.filter(e => result.current.isActive(e)).map(e => e.id)
        expect(active).toEqual(['expenses'])
    })

    it.each([
        '/a/books/settings',
        '/a/books/settings/company',
    ])('marks only Settings active on %s', pathname => {
        url.pathname = pathname
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        const active = allAvailable.filter(e => result.current.isActive(e)).map(e => e.id)
        expect(active).toEqual(['settings'])
    })
})
