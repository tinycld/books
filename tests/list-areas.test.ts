import { describe, expect, it } from 'vitest'
import { areaOf, LIST_AREAS } from '../tinycld/books/lib/list-areas'
import { PURCHASE_TABS, vendorTransactionsTab } from '../tinycld/books/lib/purchase-lists'
import { customerTransactionsTab, SALES_TABS } from '../tinycld/books/lib/sales-lists'

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
