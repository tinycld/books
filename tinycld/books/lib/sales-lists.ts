// The Sales area's tabs (spec docs/specs/sales-lists-design.md §2, §3): each tab's route,
// the kinds it lists, its columns, chips and sortable columns, and its New action.

import type { DocumentListTab, ListChip, ListColumnKey, ListSortKey } from './document-list'
import { BASE_SORT_KEYS, listChips as chips } from './list-chips'
import { areaTabOf } from './list-tabs'
import { NEW_ACTIONS } from './new-actions'
import type { TransactionFilter, TransactionKind } from './party-transactions'

const ALL_KINDS: readonly TransactionKind[] = [
    'invoice',
    'estimate',
    'sales_receipt',
    'payment',
    'credit_memo',
]

// The New action of each kind, by its NEW_ACTIONS id.
const NEW_ACTION_IDS: Record<TransactionKind, string> = {
    invoice: 'invoice',
    estimate: 'estimate',
    sales_receipt: 'sales_receipt',
    payment: 'receive_payment',
    credit_memo: 'credit_memo',
}

const NEW_LABELS: Record<TransactionKind, string> = {
    invoice: 'New invoice',
    estimate: 'New estimate',
    sales_receipt: 'New sales receipt',
    payment: 'Receive payment',
    credit_memo: 'New credit memo',
}

function newHrefOf(kind: TransactionKind): string {
    const action = NEW_ACTIONS.find(entry => entry.id === NEW_ACTION_IDS[kind])
    if (action === undefined) throw new Error(`NEW_ACTIONS has no action for ${kind}`)
    return action.href
}

function kindTab(
    kind: TransactionKind,
    tab: {
        key: string
        label: string
        noun: string
        columns: readonly ListColumnKey[]
        chips: readonly ListChip[]
        sortKeys?: readonly ListSortKey[]
    }
): DocumentListTab {
    return {
        key: tab.key,
        area: 'sales',
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
    }
}

const ALL_SALES_TAB: DocumentListTab = {
    key: 'all',
    area: 'sales',
    label: 'All sales',
    path: 'books/sales',
    kinds: ALL_KINDS,
    noun: 'sales transactions',
    newLabel: 'New',
    newHref: null,
    columns: ['date', 'type', 'number', 'customer', 'memo', 'amount', 'status'],
    chips: chips('All', 'Open', 'Overdue', 'Closed', 'Draft', 'Void'),
    sortKeys: BASE_SORT_KEYS,
    isSigned: true,
}

export const SALES_TABS: readonly DocumentListTab[] = [
    ALL_SALES_TAB,
    kindTab('invoice', {
        key: 'invoices',
        label: 'Invoices',
        noun: 'invoices',
        columns: ['date', 'number', 'customer', 'due', 'balance', 'total', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Paid', 'Draft', 'Void'),
        sortKeys: ['due', 'balance'],
    }),
    kindTab('estimate', {
        key: 'estimates',
        label: 'Estimates',
        noun: 'estimates',
        columns: ['date', 'number', 'customer', 'expires', 'total', 'status'],
        chips: chips('All', 'Pending', 'Accepted', 'Rejected', 'Closed', 'Expired'),
        sortKeys: ['expires'],
    }),
    kindTab('sales_receipt', {
        key: 'sales-receipts',
        label: 'Sales receipts',
        noun: 'sales receipts',
        columns: ['date', 'number', 'customer', 'memo', 'total', 'status'],
        chips: chips('All', 'Paid', 'Draft', 'Void'),
    }),
    kindTab('payment', {
        key: 'payments',
        label: 'Payments',
        noun: 'payments',
        columns: ['date', 'number', 'customer', 'reference', 'total', 'status'],
        chips: chips('All', 'Applied', 'Credit left', 'Draft', 'Void'),
    }),
    kindTab('credit_memo', {
        key: 'credit-memos',
        label: 'Credit memos',
        noun: 'credit memos',
        columns: ['date', 'number', 'customer', 'balance', 'total', 'status'],
        chips: chips('All', 'Unapplied', 'Applied', 'Draft', 'Void'),
        sortKeys: ['balance'],
    }),
]

// An unknown key gives All sales.
export function salesTabOf(key: string): DocumentListTab {
    return areaTabOf({ tabs: SALES_TABS }, key)
}

export function salesTabForKind(kind: TransactionKind): DocumentListTab {
    const tab = SALES_TABS.find(entry => entry.kinds.length === 1 && entry.kinds[0] === kind)
    if (tab === undefined) throw new Error(`no sales tab lists ${kind}`)
    return tab
}

function kindOfAction(actionId: string): TransactionKind {
    const kind = ALL_KINDS.find(entry => NEW_ACTION_IDS[entry] === actionId)
    if (kind === undefined) throw new Error(`NEW_ACTIONS ${actionId} is not a sales kind`)
    return kind
}

// The All sales New menu: the NEW_ACTIONS that take a customer, in their order, with the
// kind tabs' New labels.
export const SALES_NEW_ITEMS: readonly { kind: TransactionKind; label: string; href: string }[] =
    NEW_ACTIONS.filter(action => action.takesCustomer).map(action => {
        const kind = kindOfAction(action.id)
        return { kind, label: NEW_LABELS[kind], href: action.href }
    })

// The customer page's Transactions tab (spec §3.5 of the customer pages): one customer's
// documents of every kind, or of one kind, newest first, with a credit memo negative.
// Its kind chips are its own (TRANSACTION_FILTERS), so the list's chip is always All.
export function customerTransactionsTab(filter: TransactionFilter): DocumentListTab {
    return {
        ...ALL_SALES_TAB,
        key: `customer-${filter}`,
        label: 'Transactions',
        path: 'books/customers',
        kinds: filter === 'all' ? ALL_KINDS : [filter],
        noun: 'transactions',
        chips: chips('All'),
        sortKeys: ['date'],
    }
}
