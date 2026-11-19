import { describe, expect, it } from 'vitest'
import { areaOf, areaTabOf, LIST_AREAS } from '../tinycld/books/lib/list-areas'
import {
    PURCHASE_TABS,
    purchaseTabOf,
    vendorTransactionsTab,
} from '../tinycld/books/lib/purchase-lists'
import { customerTransactionsTab, SALES_TABS, salesTabOf } from '../tinycld/books/lib/sales-lists'

// The two list areas (spec §2 "Where it lives": each list belongs to a list area, which
// gives its title, tabs, New items, party, texts, shortcut group and test-id prefix).

describe('LIST_AREAS', () => {
    it('gives Sales its title, prefix, tabs, party, texts, shortcut group and log context', () => {
        const sales = LIST_AREAS.sales
        expect(sales.key).toBe('sales')
        expect(sales.title).toBe('Sales')
        expect(sales.testIdPrefix).toBe('sales')
        expect(sales.tabs).toBe(SALES_TABS)
        expect(sales.party).toEqual({
            noun: 'customer',
            label: 'Customer',
            allLabel: 'All customers',
            collection: 'books_customers',
            searchPlaceholder: 'Search customers',
            emptyText: 'No customers match',
            loadErrorText: 'Customer could not load',
            notFoundText: 'Customer not found',
        })
        expect(sales.texts).toEqual({
            loadError: 'Sales transactions could not load.',
            searchPlaceholder: 'Number or memo',
        })
        expect(sales.shortcutGroup).toBe('Sales')
        expect(sales.logContext).toBe('books.sales-lists')
    })

    it('gives Expenses its title, prefix, tabs, party, texts, shortcut group and log context', () => {
        const purchases = LIST_AREAS.purchases
        expect(purchases.key).toBe('purchases')
        expect(purchases.title).toBe('Expenses')
        expect(purchases.testIdPrefix).toBe('purchases')
        expect(purchases.tabs).toBe(PURCHASE_TABS)
        expect(purchases.party).toEqual({
            noun: 'vendor',
            label: 'Vendor',
            allLabel: 'All vendors',
            collection: 'books_vendors',
            searchPlaceholder: 'Search vendors',
            emptyText: 'No vendors match',
            loadErrorText: 'Vendor could not load',
            notFoundText: 'Vendor not found',
        })
        expect(purchases.texts).toEqual({
            loadError: 'Purchase transactions could not load.',
            searchPlaceholder: 'Number, reference or memo',
        })
        expect(purchases.shortcutGroup).toBe('Expenses')
        expect(purchases.logContext).toBe('books.purchase-lists')
    })

    it('gives the Sales New items their kind with "_" as "-" as id suffix', () => {
        expect(LIST_AREAS.sales.newItems.map(item => item.idSuffix)).toEqual([
            'invoice',
            'estimate',
            'sales-receipt',
            'payment',
            'credit-memo',
        ])
    })

    it('gives the Expenses New items their NEW_ACTIONS id with "_" as "-" as id suffix', () => {
        expect(LIST_AREAS.purchases.newItems.map(item => item.idSuffix)).toEqual([
            'bill',
            'pay-bills',
            'expense',
            'vendor-credit',
            'vendor-refund',
        ])
    })
})

// Checkpoint 2: the row actions (tick boxes, Batch actions, row menus) are on for Sales and
// off for Expenses until checkpoint 4 adds them.
describe('hasRowActions', () => {
    it('is true for sales and false for purchases', () => {
        expect(LIST_AREAS.sales.hasRowActions).toBe(true)
        expect(LIST_AREAS.purchases.hasRowActions).toBe(false)
    })
})

// The one tab lookup of an area (fix round 1): `salesTabOf` and `purchaseTabOf` go through it.
describe('areaTabOf', () => {
    it('gives the tab with the key, in each area', () => {
        expect(areaTabOf(LIST_AREAS.sales, 'credit-memos')).toBe(SALES_TABS[5])
        expect(areaTabOf(LIST_AREAS.purchases, 'vendor-refunds')).toBe(PURCHASE_TABS[5])
    })

    it("gives the area's first tab for an unknown key, in each area", () => {
        expect(areaTabOf(LIST_AREAS.sales, 'no-such-tab')).toBe(SALES_TABS[0])
        expect(areaTabOf(LIST_AREAS.sales, 'no-such-tab').key).toBe('all')
        expect(areaTabOf(LIST_AREAS.purchases, 'no-such-tab')).toBe(PURCHASE_TABS[0])
        expect(areaTabOf(LIST_AREAS.purchases, 'no-such-tab').label).toBe('All purchases')
        // A key of the other area is unknown here too.
        expect(areaTabOf(LIST_AREAS.purchases, 'invoices')).toBe(PURCHASE_TABS[0])
        expect(areaTabOf(LIST_AREAS.sales, 'bills')).toBe(SALES_TABS[0])
    })

    it('gives salesTabOf and purchaseTabOf the same rule', () => {
        expect(salesTabOf('no-such-tab')).toBe(SALES_TABS[0])
        expect(purchaseTabOf('no-such-tab')).toBe(PURCHASE_TABS[0])
        expect(salesTabOf('estimates')).toBe(areaTabOf(LIST_AREAS.sales, 'estimates'))
        expect(purchaseTabOf('bills')).toBe(areaTabOf(LIST_AREAS.purchases, 'bills'))
    })
})

describe('areaOf', () => {
    it.each(
        SALES_TABS.map(tab => [tab.key, tab] as const)
    )('puts sales tab %s in Sales', (_key, tab) => {
        expect(areaOf(tab)).toBe(LIST_AREAS.sales)
    })

    it.each(
        PURCHASE_TABS.map(tab => [tab.key, tab] as const)
    )('puts purchase tab %s in Expenses', (_key, tab) => {
        expect(areaOf(tab)).toBe(LIST_AREAS.purchases)
    })

    it('puts the customer page tab in Sales and the vendor page tab in Expenses', () => {
        expect(areaOf(customerTransactionsTab('all'))).toBe(LIST_AREAS.sales)
        expect(areaOf(vendorTransactionsTab('all'))).toBe(LIST_AREAS.purchases)
    })
})
