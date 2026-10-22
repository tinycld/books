// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksSidebar } from '../tinycld/books/hooks/useBooksSidebar'
import { isActivePath, SIDEBAR_ENTRIES, type SidebarEntry } from '../tinycld/books/lib/shell-nav'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'

const url = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))

const allAvailable: SidebarEntry[] = SIDEBAR_ENTRIES.map(entry => ({ ...entry, available: true }))

describe('useBooksSidebar', () => {
    beforeEach(() => {
        useBooksUIStore.setState({ isAccountingOpen: true })
        url.pathname = '/'
    })

    it('splits available entries into top and accounting', () => {
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        expect(result.current.top.map(e => e.id)).toEqual(['lists'])
        expect(result.current.accounting.map(e => e.id)).toEqual(['accounts', 'entries'])
    })

    it('returns an empty accounting list when no accounting entry is available', () => {
        const entries = allAvailable.map(e =>
            e.group === 'accounting' ? { ...e, available: false } : e
        )
        const { result } = renderHook(() => useBooksSidebar(entries))
        expect(result.current.accounting).toEqual([])
        expect(result.current.top.map(e => e.id)).toEqual(['lists'])
    })

    it('excludes unavailable entries from both sections', () => {
        const top = { ...allAvailable[0], id: 'hidden-top', available: false }
        const hiddenAccounting = { ...allAvailable[1], id: 'hidden-acct', available: false }
        const entries = [...allAvailable, top, hiddenAccounting]
        const { result } = renderHook(() => useBooksSidebar(entries))
        expect(result.current.top.map(e => e.id)).toEqual(['lists'])
        expect(result.current.accounting.map(e => e.id)).toEqual(['accounts', 'entries'])
    })

    it('toggleAccounting flips isAccountingOpen', () => {
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        expect(result.current.isAccountingOpen).toBe(true)
        act(() => result.current.toggleAccounting())
        expect(result.current.isAccountingOpen).toBe(false)
        act(() => result.current.toggleAccounting())
        expect(result.current.isAccountingOpen).toBe(true)
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

    it('shows the accounting entries and reports hasAccounting when unfolded', () => {
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        expect(result.current.visibleAccounting.map(e => e.id)).toEqual(['accounts', 'entries'])
        expect(result.current.hasAccounting).toBe(true)
    })

    it('hides visibleAccounting but keeps hasAccounting when folded', () => {
        const { result } = renderHook(() => useBooksSidebar(allAvailable))
        act(() => result.current.toggleAccounting())
        expect(result.current.visibleAccounting).toEqual([])
        expect(result.current.hasAccounting).toBe(true)
    })

    it('reports no accounting when no accounting entry is available', () => {
        const entries = allAvailable.map(e =>
            e.group === 'accounting' ? { ...e, available: false } : e
        )
        const { result } = renderHook(() => useBooksSidebar(entries))
        expect(result.current.hasAccounting).toBe(false)
        expect(result.current.visibleAccounting).toEqual([])
    })
})
