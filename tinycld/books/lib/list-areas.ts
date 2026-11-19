// The list areas (spec docs/specs/purchase-lists-design.md §2 "Where it lives"): each
// document list belongs to one, which gives its title, tabs, New items, party (customer or
// vendor), texts, shortcut group, log context and test-id prefix. Free of React Native and
// icon imports: the e2e helpers import the tab modules it reads in Node.

import type { DocumentListTab, ListKind } from './document-list'
import { PURCHASE_NEW_ITEMS, PURCHASE_TABS } from './purchase-lists'
import { SALES_NEW_ITEMS, SALES_TABS } from './sales-lists'

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
