import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS, type NewAction } from '../tinycld/books/lib/new-actions'
import {
    transactionActions,
    transactionHref,
    transactionItemTestId,
} from '../tinycld/books/lib/transaction-actions'

// The party page's New transaction menu (customer-pages spec §3.3, vendor-pages spec
// §3.3): the transactions of NEW_ACTIONS that take the party, and where each one opens.
// Receive payment is a real action of NEW_ACTIONS since receive-payment checkpoint 2.

// NEW_ACTIONS with the Receive payment action changed.
function withReceivePayment(change: (action: NewAction) => NewAction): NewAction[] {
    return NEW_ACTIONS.map(action => (action.id === 'receive_payment' ? change(action) : action))
}

describe('transactionActions', () => {
    it('lists Invoice, Estimate, Sales receipt, Receive payment, Credit memo and Refund receipt in NEW_ACTIONS order', () => {
        expect(transactionActions('customer')).toEqual([
            { id: 'invoice', label: 'Invoice', testId: 'customer-new-invoice' },
            { id: 'estimate', label: 'Estimate', testId: 'customer-new-estimate' },
            { id: 'sales_receipt', label: 'Sales receipt', testId: 'customer-new-sales-receipt' },
            {
                id: 'receive_payment',
                label: 'Receive payment',
                testId: 'customer-new-receive-payment',
            },
            { id: 'credit_memo', label: 'Credit memo', testId: 'customer-new-credit-memo' },
            {
                id: 'refund_receipt',
                label: 'Refund receipt',
                testId: 'customer-new-refund-receipt',
            },
            { id: 'statement', label: 'Statement', testId: 'customer-new-statement' },
        ])
    })

    it('lists exactly Purchase order, Bill, Pay bills, Expense, Vendor credit and Vendor refund for a vendor, in NEW_ACTIONS order', () => {
        const vendorIds = [
            'purchase_order',
            'bill',
            'pay_bills',
            'expense',
            'vendor_credit',
            'vendor_refund',
        ]
        const inNewActionsOrder = NEW_ACTIONS.map(action => action.id).filter(id =>
            vendorIds.includes(id)
        )
        expect(inNewActionsOrder).toHaveLength(6)
        const actions = transactionActions('vendor')
        expect(actions.map(a => a.id)).toEqual(inNewActionsOrder)
        expect(actions.map(a => a.testId)).toEqual(
            inNewActionsOrder.map(id => `vendor-new-${id.replaceAll('_', '-')}`)
        )
    })

    it('leaves out an action that does not take a customer', () => {
        const actions = withReceivePayment(({ takesCustomer: _flag, ...rest }) => rest)
        expect(transactionActions('customer', actions).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
            'credit_memo',
            'refund_receipt',
            'statement',
        ])
    })

    it('leaves out an action that is not available', () => {
        const actions = withReceivePayment(action => ({ ...action, available: false }))
        expect(transactionActions('customer', actions).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
            'credit_memo',
            'refund_receipt',
            'statement',
        ])
    })
})

describe('transactionHref', () => {
    it('opens the new document with the customer', () => {
        expect(transactionHref('customer', 'invoice', 'abc')).toBe(
            'books/invoices/new?customer=abc'
        )
        expect(transactionHref('customer', 'estimate', 'abc')).toBe(
            'books/estimates/new?customer=abc'
        )
        expect(transactionHref('customer', 'sales_receipt', 'abc')).toBe(
            'books/sales-receipts/new?customer=abc'
        )
        expect(transactionHref('customer', 'receive_payment', 'abc')).toBe(
            'books/payments/new?customer=abc'
        )
        expect(transactionHref('customer', 'invoice', 'c1')).toBe('books/invoices/new?customer=c1')
    })

    it('opens a new credit memo with the customer', () => {
        expect(transactionHref('customer', 'credit_memo', 'abc')).toBe(
            'books/credit-memos/new?customer=abc'
        )
    })

    it('opens a new refund receipt with the customer', () => {
        expect(transactionHref('customer', 'refund_receipt', 'abc')).toBe(
            'books/refund-receipts/new?customer=abc'
        )
    })

    it('opens a vendor transaction with the vendor param', () => {
        expect(transactionHref('vendor', 'pay_bills', 'v1')).toBe('books/pay-bills?vendor=v1')
        expect(transactionHref('vendor', 'bill', 'v1')).toBe('books/bills/new?vendor=v1')
        expect(transactionHref('vendor', 'purchase_order', 'v1')).toBe(
            'books/purchase-orders/new?vendor=v1'
        )
    })

    it('refuses an action that does not take the party, as it refuses an unknown id', () => {
        expect(() => transactionHref('vendor', 'invoice', 'v1')).toThrow(RangeError)
        expect(() => transactionHref('customer', 'bill', 'c1')).toThrow(RangeError)
        expect(() => transactionHref('vendor', 'no_such_action', 'v1')).toThrow(RangeError)
    })
})

describe('transactionItemTestId', () => {
    it('writes <prefix>-new-<id> with underscores as dashes', () => {
        expect(transactionItemTestId('vendor', 'vendor_refund')).toBe('vendor-new-vendor-refund')
        expect(transactionItemTestId('customer', 'sales_receipt')).toBe(
            'customer-new-sales-receipt'
        )
    })
})
