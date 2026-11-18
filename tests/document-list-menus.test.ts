import { describe, expect, it } from 'vitest'
import { DEFAULT_LIST_SORT, type ListSort } from '../tinycld/books/lib/document-list'
import {
    ariaSortOf,
    nextSort,
    RANGE_ITEMS,
    sortMenuItems,
} from '../tinycld/books/lib/document-list-menus'
import { RANGE_PRESETS } from '../tinycld/books/lib/register-range'
import { SALES_TABS, salesTabOf } from '../tinycld/books/lib/sales-lists'

// The toolbar menus of the Sales lists (spec §3 "Search and filters", "Sort"): the date-range
// items, the cards' Sort menu, and the header sort cycle.

describe('RANGE_ITEMS', () => {
    it('is the five presets of the register range in order, then All dates', () => {
        expect(RANGE_ITEMS).toEqual([
            { id: 'this-month', label: 'This month' },
            { id: 'last-month', label: 'Last month' },
            { id: 'this-quarter', label: 'This quarter' },
            { id: 'this-fiscal-year', label: 'This fiscal year' },
            { id: 'last-fiscal-year', label: 'Last fiscal year' },
            { id: 'all-dates', label: 'All dates' },
        ])
        expect(RANGE_ITEMS.slice(0, 5)).toEqual(RANGE_PRESETS)
    })
})

describe('sortMenuItems', () => {
    it('lists the Invoices sortable columns, each in both directions, with the reference labels', () => {
        expect(sortMenuItems(salesTabOf('invoices'))).toEqual([
            {
                id: 'date-down',
                label: 'Date, newest first',
                sort: { key: 'date', isAscending: false },
            },
            {
                id: 'date-up',
                label: 'Date, oldest first',
                sort: { key: 'date', isAscending: true },
            },
            {
                id: 'number-down',
                label: 'No., high to low',
                sort: { key: 'number', isAscending: false },
            },
            {
                id: 'number-up',
                label: 'No., low to high',
                sort: { key: 'number', isAscending: true },
            },
            {
                id: 'due-down',
                label: 'Due date, newest first',
                sort: { key: 'due', isAscending: false },
            },
            {
                id: 'due-up',
                label: 'Due date, oldest first',
                sort: { key: 'due', isAscending: true },
            },
            {
                id: 'balance-down',
                label: 'Balance, high to low',
                sort: { key: 'balance', isAscending: false },
            },
            {
                id: 'balance-up',
                label: 'Balance, low to high',
                sort: { key: 'balance', isAscending: true },
            },
            {
                id: 'amount-down',
                label: 'Total, high to low',
                sort: { key: 'amount', isAscending: false },
            },
            {
                id: 'amount-up',
                label: 'Total, low to high',
                sort: { key: 'amount', isAscending: true },
            },
        ])
    })

    it('holds no Customer, Status, Type, Memo or Reference no. item on any tab', () => {
        const unsortable = /^(Customer|Status|Type|Memo|Reference no\.),/
        for (const tab of SALES_TABS) {
            const items = sortMenuItems(tab)
            expect(items.length).toBeGreaterThan(0)
            for (const item of items) {
                expect(item.label, `${tab.key}: ${item.label}`).not.toMatch(unsortable)
                expect(tab.sortKeys, `${tab.key}: ${item.id}`).toContain(item.sort.key)
            }
        }
    })
})

describe('nextSort', () => {
    it('sorts a new key ascending, a second press descending, a third ascending again', () => {
        const first = nextSort(DEFAULT_LIST_SORT, 'number')
        expect(first).toEqual({ key: 'number', isAscending: true })
        const second = nextSort(first, 'number')
        expect(second).toEqual({ key: 'number', isAscending: false })
        const third = nextSort(second, 'number')
        expect(third).toEqual({ key: 'number', isAscending: true })
    })

    it('starts a different key ascending even when the current sort is ascending', () => {
        const byNumber: ListSort = { key: 'number', isAscending: true }
        expect(nextSort(byNumber, 'amount')).toEqual({ key: 'amount', isAscending: true })
    })
})

describe('ariaSortOf', () => {
    it('gives none for a column that is not sorted', () => {
        expect(ariaSortOf({ key: 'date', isAscending: false }, 'number')).toBe('none')
        expect(ariaSortOf({ key: 'amount', isAscending: true }, 'balance')).toBe('none')
    })

    it('gives the order of the sorted column', () => {
        expect(ariaSortOf({ key: 'number', isAscending: true }, 'number')).toBe('ascending')
        expect(ariaSortOf({ key: 'number', isAscending: false }, 'number')).toBe('descending')
    })
})
