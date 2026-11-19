import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS } from '../tinycld/books/lib/new-actions'
import {
    customerTransactionsTab,
    SALES_NEW_ITEMS,
    SALES_TABS,
    salesTabForKind,
    salesTabOf,
} from '../tinycld/books/lib/sales-lists'

const chips = (...labels: string[]) =>
    labels.map(label => ({ id: label.toLowerCase().replace(/ /g, '-'), label }))

// Spec §2 and §3: the tabs, their routes, columns and chips, in order.
const EXPECTED_TABS = [
    {
        key: 'all',
        label: 'All sales',
        path: 'books/sales',
        kinds: ['invoice', 'estimate', 'sales_receipt', 'payment', 'credit_memo', 'refund_receipt'],
        newLabel: 'New',
        columns: ['date', 'type', 'number', 'customer', 'memo', 'amount', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Closed', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
    },
    {
        key: 'invoices',
        label: 'Invoices',
        path: 'books/invoices',
        kinds: ['invoice'],
        newLabel: 'New invoice',
        columns: ['date', 'number', 'customer', 'due', 'balance', 'total', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Paid', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount', 'due', 'balance'],
    },
    {
        key: 'estimates',
        label: 'Estimates',
        path: 'books/estimates',
        kinds: ['estimate'],
        newLabel: 'New estimate',
        columns: ['date', 'number', 'customer', 'expires', 'total', 'status'],
        chips: chips('All', 'Pending', 'Accepted', 'Rejected', 'Closed', 'Expired'),
        sortKeys: ['date', 'number', 'amount', 'expires'],
    },
    {
        key: 'sales-receipts',
        label: 'Sales receipts',
        path: 'books/sales-receipts',
        kinds: ['sales_receipt'],
        newLabel: 'New sales receipt',
        columns: ['date', 'number', 'customer', 'memo', 'total', 'status'],
        chips: chips('All', 'Paid', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
    },
    {
        key: 'payments',
        label: 'Payments',
        path: 'books/payments',
        kinds: ['payment'],
        newLabel: 'Receive payment',
        columns: ['date', 'number', 'customer', 'reference', 'total', 'status'],
        chips: chips('All', 'Applied', 'Credit left', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
    },
    {
        key: 'credit-memos',
        label: 'Credit memos',
        path: 'books/credit-memos',
        kinds: ['credit_memo'],
        newLabel: 'New credit memo',
        columns: ['date', 'number', 'customer', 'balance', 'total', 'status'],
        // Refund receipt spec §3.12: a posted memo at balance 0 reads Refunded.
        chips: chips('All', 'Unapplied', 'Refunded', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount', 'balance'],
    },
    // Refund receipt spec §3.13: as the sales receipts tab, with Refunded for Paid.
    {
        key: 'refund-receipts',
        label: 'Refund receipts',
        path: 'books/refund-receipts',
        kinds: ['refund_receipt'],
        newLabel: 'New refund receipt',
        columns: ['date', 'number', 'customer', 'memo', 'total', 'status'],
        chips: chips('All', 'Refunded', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
    },
] as const

describe('SALES_TABS', () => {
    it('has the seven tabs in tab order, Refund receipts right after Credit memos', () => {
        const keys = SALES_TABS.map(tab => tab.key)
        expect(keys.indexOf('refund-receipts')).toBe(keys.indexOf('credit-memos') + 1)
        expect(SALES_TABS.map(tab => tab.key)).toEqual(EXPECTED_TABS.map(tab => tab.key))
    })

    it.each(
        EXPECTED_TABS
    )('$label has its label, path, kinds, New label, columns and chips', expected => {
        const tab = salesTabOf(expected.key)
        expect(tab.label).toBe(expected.label)
        expect(tab.path).toBe(expected.path)
        expect([...tab.kinds]).toEqual([...expected.kinds])
        expect(tab.newLabel).toBe(expected.newLabel)
        expect([...tab.columns]).toEqual([...expected.columns])
        expect([...tab.chips]).toEqual(expected.chips)
    })

    it.each(EXPECTED_TABS)('$label sorts by its sortable columns', expected => {
        expect([...salesTabOf(expected.key).sortKeys].sort()).toEqual([...expected.sortKeys].sort())
    })

    it('puts every tab in the sales area', () => {
        expect(SALES_TABS.map(tab => tab.area)).toEqual(SALES_TABS.map(() => 'sales'))
        expect(customerTransactionsTab('all').area).toBe('sales')
    })

    it('makes only All sales signed and gives only All sales no New route', () => {
        expect(SALES_TABS.filter(tab => tab.isSigned).map(tab => tab.key)).toEqual(['all'])
        expect(SALES_TABS.filter(tab => tab.newHref === null).map(tab => tab.key)).toEqual(['all'])
    })

    it("opens each kind tab's New from the kind's new route in NEW_ACTIONS", () => {
        const routes = NEW_ACTIONS.filter(action => action.takesCustomer).map(a => a.href)
        expect(SALES_TABS.slice(1).map(tab => tab.newHref)).toEqual(routes)
    })

    it('finds the tab of each kind', () => {
        expect(salesTabForKind('invoice').key).toBe('invoices')
        expect(salesTabForKind('estimate').key).toBe('estimates')
        expect(salesTabForKind('sales_receipt').key).toBe('sales-receipts')
        expect(salesTabForKind('payment').key).toBe('payments')
        expect(salesTabForKind('credit_memo').key).toBe('credit-memos')
        expect(salesTabForKind('refund_receipt').key).toBe('refund-receipts')
    })

    it('Refund receipts has the columns of the Sales receipts tab', () => {
        expect([...salesTabOf('refund-receipts').columns]).toEqual([
            ...salesTabOf('sales-receipts').columns,
        ])
    })
})

describe('SALES_NEW_ITEMS', () => {
    it('are the takesCustomer entries of NEW_ACTIONS with the New labels', () => {
        const actions = NEW_ACTIONS.filter(action => action.takesCustomer)
        expect(SALES_NEW_ITEMS.map(item => item.href)).toEqual(actions.map(a => a.href))
        expect(SALES_NEW_ITEMS).toEqual([
            { kind: 'invoice', label: 'New invoice', href: 'books/invoices/new' },
            { kind: 'estimate', label: 'New estimate', href: 'books/estimates/new' },
            { kind: 'sales_receipt', label: 'New sales receipt', href: 'books/sales-receipts/new' },
            { kind: 'payment', label: 'Receive payment', href: 'books/payments/new' },
            { kind: 'credit_memo', label: 'New credit memo', href: 'books/credit-memos/new' },
            {
                kind: 'refund_receipt',
                label: 'New refund receipt',
                href: 'books/refund-receipts/new',
            },
        ])
    })
})

describe('customerTransactionsTab', () => {
    it('lists six kinds for all and one for a kind, signed', () => {
        const all = customerTransactionsTab('all')
        expect([...all.kinds].sort()).toEqual(
            [
                'credit_memo',
                'estimate',
                'invoice',
                'payment',
                'refund_receipt',
                'sales_receipt',
            ].sort()
        )
        expect(all.isSigned).toBe(true)
        const payments = customerTransactionsTab('payment')
        expect([...payments.kinds]).toEqual(['payment'])
        expect(payments.isSigned).toBe(true)
    })
})
