// The list areas (the Purchase lists design spec §2 "Where it lives"): each
// document list belongs to one, which gives its title, tabs, New items, party (customer or
// vendor), texts, shortcut group, log context and test-id prefix. Free of React Native and
// icon imports: the e2e helpers import the tab modules it reads in Node.

import type { DocumentListTab, ListKind } from './document-list'
import { PURCHASE_NEW_ITEMS, PURCHASE_TABS } from './purchase-lists'
import { SALES_NEW_ITEMS, SALES_TABS } from './sales-lists'

export { areaTabOf } from './list-tabs'

export type ListAreaKey = 'sales' | 'purchases'

export type ListArea = {
    key: ListAreaKey
    title: string
    testIdPrefix: 'sales' | 'purchases'
    tabs: readonly DocumentListTab[]
    // `idSuffix` ends the New item's test id (`<prefix>-new-<idSuffix>`).
    newItems: readonly { kind: ListKind; label: string; href: string; idSuffix: string }[]
    party: {
        noun: 'customer' | 'vendor'
        label: 'Customer' | 'Vendor'
        allLabel: 'All customers' | 'All vendors'
        collection: 'books_customers' | 'books_vendors'
        // The party filter's texts (`DocumentPartyFilter`).
        searchPlaceholder: string
        emptyText: string
        loadErrorText: string
        notFoundText: string
    }
    texts: { loadError: string; searchPlaceholder: string }
    shortcutGroup: 'Sales' | 'Expenses'
    logContext: 'books.sales-lists' | 'books.purchase-lists'
}

export const LIST_AREAS: Record<ListAreaKey, ListArea> = {
    sales: {
        key: 'sales',
        title: 'Sales',
        testIdPrefix: 'sales',
        tabs: SALES_TABS,
        // A Sales item's test id ends with its kind, with dashes.
        newItems: SALES_NEW_ITEMS.map(item => ({
            ...item,
            idSuffix: item.kind.replaceAll('_', '-'),
        })),
        party: {
            noun: 'customer',
            label: 'Customer',
            allLabel: 'All customers',
            collection: 'books_customers',
            searchPlaceholder: 'Search customers',
            emptyText: 'No customers match',
            loadErrorText: 'Customer could not load',
            notFoundText: 'Customer not found',
        },
        texts: {
            loadError: 'Sales transactions could not load.',
            searchPlaceholder: 'Number or memo',
        },
        shortcutGroup: 'Sales',
        logContext: 'books.sales-lists',
    },
    purchases: {
        key: 'purchases',
        title: 'Expenses',
        testIdPrefix: 'purchases',
        tabs: PURCHASE_TABS,
        newItems: PURCHASE_NEW_ITEMS,
        party: {
            noun: 'vendor',
            label: 'Vendor',
            allLabel: 'All vendors',
            collection: 'books_vendors',
            searchPlaceholder: 'Search vendors',
            emptyText: 'No vendors match',
            loadErrorText: 'Vendor could not load',
            notFoundText: 'Vendor not found',
        },
        texts: {
            loadError: 'Purchase transactions could not load.',
            searchPlaceholder: 'Number, reference or memo',
        },
        shortcutGroup: 'Expenses',
        logContext: 'books.purchase-lists',
    },
}

export function areaOf(tab: Pick<DocumentListTab, 'area'>): ListArea {
    return LIST_AREAS[tab.area]
}
