// The Expenses area's tabs (the Purchase lists design spec §2, §3): each tab's
// route, the kinds it lists, its columns, chips and sortable columns, and its New action.
// Free of React Native and icon imports: the e2e helpers import it in Node.

import type {
    DocumentListTab,
    ListChip,
    ListColumnKey,
    ListSortKey,
    TabReport,
} from './document-list'
import { BASE_SORT_KEYS, listChips as chips } from './list-chips'
import { areaTabOf } from './list-tabs'
import { NEW_ACTIONS } from './new-actions'
import { OPEN_PURCHASE_ORDERS_SHIPPED_KEY } from './shipped-reports'
import type { VendorTransactionFilter, VendorTransactionKind } from './vendor-transactions'

const ALL_KINDS: readonly VendorTransactionKind[] = [
    'bill',
    'purchase_order',
    'expense',
    'bill_payment',
    'vendor_credit',
    'vendor_refund',
]

// The New action of each kind, by its NEW_ACTIONS id: a bill payment is made on Pay Bills.
const NEW_ACTION_IDS: Record<VendorTransactionKind, string> = {
    bill: 'bill',
    purchase_order: 'purchase_order',
    expense: 'expense',
    bill_payment: 'pay_bills',
    vendor_credit: 'vendor_credit',
    vendor_refund: 'vendor_refund',
}

const NEW_LABELS: Record<VendorTransactionKind, string> = {
    bill: 'New bill',
    purchase_order: 'New purchase order',
    expense: 'New expense',
    bill_payment: 'Pay bills',
    vendor_credit: 'New vendor credit',
    vendor_refund: 'New vendor refund',
}

function newHrefOf(kind: VendorTransactionKind): string {
    const action = NEW_ACTIONS.find(entry => entry.id === NEW_ACTION_IDS[kind])
    if (action === undefined) throw new Error(`NEW_ACTIONS has no action for ${kind}`)
    return action.href
}

function kindTab(
    kind: VendorTransactionKind,
    tab: {
        key: string
        label: string
        noun: string
        columns: readonly ListColumnKey[]
        chips: readonly ListChip[]
        sortKeys?: readonly ListSortKey[]
        report?: TabReport
    }
): DocumentListTab {
    return {
        key: tab.key,
        area: 'purchases',
        label: tab.label,
        path: `books/${tab.key}`,
        kinds: [kind],
        noun: tab.noun,
        newLabel: NEW_LABELS[kind],
        newHref: newHrefOf(kind),
        columns: tab.columns,
        chips: tab.chips,
        sortKeys: [...BASE_SORT_KEYS, ...(tab.sortKeys ?? [])],
        isSigned: false,
        report: tab.report,
    }
}

// A vendor credit's amount is negative here (spec §3, Q7), so the tab is signed.
const ALL_PURCHASES_TAB: DocumentListTab = {
    key: 'all',
    area: 'purchases',
    label: 'All purchases',
    path: 'books/purchases',
    kinds: ALL_KINDS,
    noun: 'purchase transactions',
    newLabel: 'New',
    newHref: null,
    columns: ['date', 'type', 'number', 'vendor', 'category', 'amount', 'status'],
    chips: chips('All', 'Open', 'Overdue', 'Closed', 'Draft', 'Void'),
    sortKeys: BASE_SORT_KEYS,
    isSigned: true,
}

export const PURCHASE_TABS: readonly DocumentListTab[] = [
    ALL_PURCHASES_TAB,
    kindTab('bill', {
        key: 'bills',
        label: 'Bills',
        noun: 'bills',
        columns: ['date', 'number', 'vendor', 'due', 'balance', 'total', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Paid', 'Draft', 'Void'),
        sortKeys: ['due', 'balance'],
    }),
    // Purchase order spec §3.9: Open is the order's stored `open_amount`. The toolbar
    // links the Open Purchase Orders report (§3.10).
    kindTab('purchase_order', {
        key: 'purchase-orders',
        label: 'Purchase orders',
        noun: 'purchase orders',
        columns: ['date', 'number', 'vendor', 'open', 'total', 'status'],
        chips: chips('All', 'Open', 'Closed'),
        sortKeys: ['open'],
        report: {
            shippedKey: OPEN_PURCHASE_ORDERS_SHIPPED_KEY,
            label: 'Open Purchase Orders',
            testIdSuffix: 'open-orders-report',
        },
    }),
    kindTab('expense', {
        key: 'expenses',
        label: 'Expenses',
        noun: 'expenses',
        columns: ['date', 'number', 'vendor', 'category', 'total', 'status'],
        chips: chips('All', 'Paid', 'Draft', 'Void'),
    }),
    kindTab('bill_payment', {
        key: 'bill-payments',
        label: 'Bill payments',
        noun: 'bill payments',
        columns: ['date', 'number', 'vendor', 'reference', 'amount', 'status'],
        chips: chips('All', 'Paid', 'Void'),
    }),
    kindTab('vendor_credit', {
        key: 'vendor-credits',
        label: 'Vendor credits',
        noun: 'vendor credits',
        columns: ['date', 'number', 'vendor', 'balance', 'total', 'status'],
        chips: chips('All', 'Unapplied', 'Closed', 'Draft', 'Void'),
        sortKeys: ['balance'],
    }),
    kindTab('vendor_refund', {
        key: 'vendor-refunds',
        label: 'Vendor refunds',
        noun: 'vendor refunds',
        columns: ['date', 'number', 'vendor', 'reference', 'amount', 'status'],
        chips: chips('All', 'Received', 'Draft', 'Void'),
    }),
]

// An unknown key gives All purchases.
export function purchaseTabOf(key: string): DocumentListTab {
    return areaTabOf({ tabs: PURCHASE_TABS }, key)
}

export function purchaseTabForKind(kind: VendorTransactionKind): DocumentListTab {
    const tab = PURCHASE_TABS.find(entry => entry.kinds.length === 1 && entry.kinds[0] === kind)
    if (tab === undefined) throw new Error(`no purchase tab lists ${kind}`)
    return tab
}

function kindOfAction(actionId: string): VendorTransactionKind {
    const kind = ALL_KINDS.find(entry => NEW_ACTION_IDS[entry] === actionId)
    if (kind === undefined) throw new Error(`NEW_ACTIONS ${actionId} is not a purchase kind`)
    return kind
}

// The All purchases New menu: the NEW_ACTIONS that take a vendor, in their order, with the
// kind tabs' New labels. `idSuffix` ends the item's test id (`purchases-new-<idSuffix>`):
// the NEW_ACTIONS id with dashes.
export const PURCHASE_NEW_ITEMS: readonly {
    kind: VendorTransactionKind
    label: string
    href: string
    idSuffix: string
}[] = NEW_ACTIONS.filter(action => action.takesVendor).map(action => {
    const kind = kindOfAction(action.id)
    return {
        kind,
        label: NEW_LABELS[kind],
        href: action.href,
        idSuffix: action.id.replaceAll('_', '-'),
    }
})

// The vendor page's Transactions tab (vendor pages §3.5): one vendor's documents of every
// kind, or of one kind, newest first, with a vendor credit negative. Its kind chips are its
// own (VENDOR_TRANSACTION_FILTERS), so the list's chip is always All. Its columns are the
// ones `PartyTransactionsList` draws; with no Category column the list reads no lines.
export function vendorTransactionsTab(filter: VendorTransactionFilter): DocumentListTab {
    return {
        ...ALL_PURCHASES_TAB,
        key: `vendor-${filter}`,
        label: 'Transactions',
        path: 'books/vendors',
        kinds: filter === 'all' ? ALL_KINDS : [filter],
        columns: ['date', 'type', 'number', 'due', 'total', 'status'],
        noun: 'transactions',
        chips: chips('All'),
        sortKeys: ['date'],
    }
}
