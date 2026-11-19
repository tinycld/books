import { beforeEach, describe, expect, it } from 'vitest'
import {
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    tabStateKey,
} from '../tinycld/books/lib/document-list'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'
import {
    selectedIn,
    selectionScope,
    useDocumentListStore,
} from '../tinycld/books/stores/document-list-store'

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

describe('tab state', () => {
    it('gives the defaults for a tab with no entry', () => {
        expect(store().tabState('invoices')).toEqual({
            filters: DEFAULT_LIST_FILTERS,
            sort: DEFAULT_LIST_SORT,
        })
    })

    it('keeps each tab key its own filters and sort', () => {
        store().setSearch('invoices', '1048')
        store().setChip('invoices', 'overdue')
        store().setRange('invoices', 'last-month')
        store().setParty('invoices', 'bcust0000000001')
        store().setSort('invoices', { key: 'number', isAscending: true })
        store().setChip('payments', 'credit-left')
        store().setSort('payments', { key: 'amount', isAscending: false })

        expect(store().tabState('invoices')).toEqual({
            filters: {
                search: '1048',
                chip: 'overdue',
                range: 'last-month',
                party: 'bcust0000000001',
            },
            sort: { key: 'number', isAscending: true },
        })
        expect(store().tabState('payments')).toEqual({
            filters: { ...DEFAULT_LIST_FILTERS, chip: 'credit-left' },
            sort: { key: 'amount', isAscending: false },
        })
        expect(store().tabState('all')).toEqual({
            filters: DEFAULT_LIST_FILTERS,
            sort: DEFAULT_LIST_SORT,
        })
    })

    it('clearFilters resets search, chip, range and customer and keeps the sort', () => {
        store().setSearch('estimates', 'deck')
        store().setChip('estimates', 'expired')
        store().setRange('estimates', 'this-quarter')
        store().setParty('estimates', 'bcust0000000002')
        store().setSort('estimates', { key: 'expires', isAscending: true })
        store().setChip('invoices', 'void')

        store().clearFilters('estimates')

        expect(store().tabState('estimates')).toEqual({
            filters: DEFAULT_LIST_FILTERS,
            sort: { key: 'expires', isAscending: true },
        })
        expect(store().tabState('invoices').filters.chip).toBe('void')
    })

    it('keeps the search, chip, range, party and sort of All sales and All purchases apart', () => {
        const sales = tabStateKey(salesTabOf('all'))
        const purchases = tabStateKey(purchaseTabOf('all'))
        expect(sales).not.toBe(purchases)
        store().setSearch(sales, '1048')
        store().setChip(sales, 'overdue')
        store().setRange(sales, 'last-month')
        store().setParty(sales, 'bcust0000000001')
        store().setSort(sales, { key: 'number', isAscending: true })
        store().setSearch(purchases, 'paper')
        store().setChip(purchases, 'draft')
        store().setRange(purchases, 'this-quarter')
        store().setParty(purchases, 'bvend0000000001')
        store().setSort(purchases, { key: 'amount', isAscending: false })

        expect(store().tabState(sales)).toEqual({
            filters: {
                search: '1048',
                chip: 'overdue',
                range: 'last-month',
                party: 'bcust0000000001',
            },
            sort: { key: 'number', isAscending: true },
        })
        expect(store().tabState(purchases)).toEqual({
            filters: {
                search: 'paper',
                chip: 'draft',
                range: 'this-quarter',
                party: 'bvend0000000001',
            },
            sort: { key: 'amount', isAscending: false },
        })

        store().clearFilters(purchases)
        expect(store().tabState(sales).filters.party).toBe('bcust0000000001')
        expect(store().tabState(purchases).filters).toEqual(DEFAULT_LIST_FILTERS)
    })
})

describe('selection', () => {
    it('selectedIn gives the ids only for the scope they were set in', () => {
        const scope = selectionScope('invoices', 'table', DEFAULT_LIST_FILTERS)
        const other = selectionScope('payments', 'table', DEFAULT_LIST_FILTERS)
        store().setSelection(scope, ['slinv0000001048', 'slinv00000draft'])

        expect(selectedIn(store().selection, scope)).toEqual(['slinv0000001048', 'slinv00000draft'])
        expect(selectedIn(store().selection, other)).toEqual([])
    })

    it('selectionScope changes with the tab, the layout and each filter', () => {
        const base = selectionScope('invoices', 'table', DEFAULT_LIST_FILTERS)
        const changed = [
            selectionScope('payments', 'table', DEFAULT_LIST_FILTERS),
            selectionScope('invoices', 'cards', DEFAULT_LIST_FILTERS),
            selectionScope('invoices', 'table', { ...DEFAULT_LIST_FILTERS, chip: 'open' }),
            selectionScope('invoices', 'table', { ...DEFAULT_LIST_FILTERS, search: 'retainer' }),
            selectionScope('invoices', 'table', { ...DEFAULT_LIST_FILTERS, range: 'this-month' }),
            selectionScope('invoices', 'table', {
                ...DEFAULT_LIST_FILTERS,
                party: 'bcust0000000001',
            }),
        ]
        for (const scope of changed) expect(scope).not.toBe(base)
        expect(new Set(changed).size).toBe(changed.length)
        expect(selectionScope('invoices', 'table', { ...DEFAULT_LIST_FILTERS })).toBe(base)
    })

    it('selectionScope differs for the All sales and the All purchases tab', () => {
        const sales = selectionScope(tabStateKey(salesTabOf('all')), 'table', DEFAULT_LIST_FILTERS)
        const purchases = selectionScope(
            tabStateKey(purchaseTabOf('all')),
            'table',
            DEFAULT_LIST_FILTERS
        )
        expect(sales).not.toBe(purchases)
        store().setSelection(sales, ['slinv0000001048'])
        expect(selectedIn(store().selection, purchases)).toEqual([])
    })

    it('a change of sort keeps the scope and the selection', () => {
        store().setChip('invoices', 'open')
        const before = selectionScope('invoices', 'table', store().tabState('invoices').filters)
        store().setSelection(before, ['slinv0000001048'])

        store().setSort('invoices', { key: 'balance', isAscending: true })

        const after = selectionScope('invoices', 'table', store().tabState('invoices').filters)
        expect(after).toBe(before)
        expect(selectedIn(store().selection, after)).toEqual(['slinv0000001048'])
    })

    it('a change of chip leaves the selection to its old scope only', () => {
        const before = selectionScope('invoices', 'table', store().tabState('invoices').filters)
        store().setSelection(before, ['slinv0000001048'])

        store().setChip('invoices', 'draft')

        const after = selectionScope('invoices', 'table', store().tabState('invoices').filters)
        expect(selectedIn(store().selection, after)).toEqual([])
    })
})
