// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useListSelection } from '../tinycld/books/hooks/useListSelection'
import {
    DEFAULT_LIST_FILTERS,
    type ListLayout,
    tabStateKey,
} from '../tinycld/books/lib/document-list'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'
import { selectionScope, useDocumentListStore } from '../tinycld/books/stores/document-list-store'

// Spec §3: "A change of tab, chip, search, date range or customer clears the selection. A
// change of sort keeps it." and "The selection clears when the list narrows to the
// column." Cleared means gone: going back to the earlier tab, filters or layout must not
// bring the old ticks back (cp4 fix round 1, reviewer A finding 1).

const LOADED = ['slinv0000001048', 'slinv0000001049', 'slinv00000draft']
const store = () => useDocumentListStore.getState()

beforeEach(() => {
    useDocumentListStore.setState({
        tabs: {},
        selection: { scope: '', ids: [] },
        focus: { scope: '', id: '' },
        banner: null,
        menu: '',
    })
})

// The list's selection as the screen builds it: the scope of the tab, the layout and the
// tab's filters as the store holds them now.
function useTabSelection(props: { tabKey: string; layout: ListLayout }) {
    const filters = useDocumentListStore(s => s.tabState(props.tabKey).filters)
    return useListSelection(selectionScope(props.tabKey, props.layout, filters), LOADED)
}

function mountList(tabKey: string, layout: ListLayout = 'table') {
    return renderHook(props => useTabSelection(props), { initialProps: { tabKey, layout } })
}

function tickTwo(list: ReturnType<typeof mountList>) {
    act(() => list.result.current.toggle('slinv0000001048'))
    act(() => list.result.current.toggle('slinv0000001049'))
    expect(list.result.current.ids).toEqual(['slinv0000001048', 'slinv0000001049'])
}

describe('useListSelection: a left scope stays cleared', () => {
    it('a chip change and back leaves no ticks', () => {
        const list = mountList('invoices')
        tickTwo(list)

        act(() => store().setChip('invoices', 'draft'))
        expect(list.result.current.ids).toEqual([])
        act(() => store().setChip('invoices', 'all'))

        expect(list.result.current.ids).toEqual([])
        expect(list.result.current.isTicked('slinv0000001048')).toBe(false)
        expect(list.result.current.headerState).toBe('empty')
    })

    it('a search, date range or customer change and back leaves no ticks', () => {
        const list = mountList('invoices')
        const filters = store().tabState('invoices').filters

        tickTwo(list)
        act(() => store().setSearch('invoices', 'retainer'))
        act(() => store().setSearch('invoices', filters.search))
        expect(list.result.current.ids).toEqual([])

        tickTwo(list)
        act(() => store().setRange('invoices', 'this-month'))
        act(() => store().setRange('invoices', filters.range))
        expect(list.result.current.ids).toEqual([])

        tickTwo(list)
        act(() => store().setParty('invoices', 'bcust0000000001'))
        act(() => store().setParty('invoices', filters.party))
        expect(list.result.current.ids).toEqual([])
    })

    it('a chip change and then Clear filters leaves no ticks', () => {
        const list = mountList('invoices')
        tickTwo(list)

        act(() => store().setChip('invoices', 'open'))
        act(() => store().clearFilters('invoices'))

        expect(list.result.current.ids).toEqual([])
    })

    it('a tab change and back leaves no ticks', () => {
        // A tab press replaces the list route: the Invoices list unmounts, All sales mounts.
        const invoices = mountList('invoices')
        tickTwo(invoices)
        invoices.unmount()

        const all = mountList('all')
        expect(all.result.current.ids).toEqual([])
        all.unmount()

        const back = mountList('invoices')
        expect(back.result.current.ids).toEqual([])
        expect(back.result.current.headerState).toBe('empty')
    })

    it('narrowing to the names column and back leaves no ticks', () => {
        const list = mountList('invoices', 'table')
        tickTwo(list)

        list.rerender({ tabKey: 'invoices', layout: 'names' })
        expect(list.result.current.ids).toEqual([])
        list.rerender({ tabKey: 'invoices', layout: 'table' })

        expect(list.result.current.ids).toEqual([])
        expect(list.result.current.isTicked('slinv0000001049')).toBe(false)
    })

    it('the ticks of All sales are not ticks of All purchases', () => {
        const salesKey = tabStateKey(salesTabOf('all'))
        const purchasesKey = tabStateKey(purchaseTabOf('all'))
        expect(selectionScope(salesKey, 'table', DEFAULT_LIST_FILTERS)).not.toBe(
            selectionScope(purchasesKey, 'table', DEFAULT_LIST_FILTERS)
        )
        const sales = mountList(salesKey)
        tickTwo(sales)
        sales.unmount()

        const purchases = mountList(purchasesKey)
        expect(purchases.result.current.ids).toEqual([])
        expect(purchases.result.current.isTicked('slinv0000001048')).toBe(false)
    })

    it('a sort change keeps the ticks', () => {
        const list = mountList('invoices')
        tickTwo(list)

        act(() => store().setSort('invoices', { key: 'balance', isAscending: true }))
        list.rerender({ tabKey: 'invoices', layout: 'table' })

        expect(list.result.current.ids).toEqual(['slinv0000001048', 'slinv0000001049'])
        expect(list.result.current.headerState).toBe('mixed')
    })
})
