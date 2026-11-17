import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS, type NewAction } from '../tinycld/books/lib/shell-nav'
import { transactionActions, transactionHref } from '../tinycld/books/lib/transaction-actions'

// The customer page's New transaction menu (spec §3.3): the transactions of NEW_ACTIONS
// that take a customer, and where each one opens. Receive payment is a real action of
// NEW_ACTIONS since receive-payment checkpoint 2.

// NEW_ACTIONS with the Receive payment action changed.
function withReceivePayment(change: (action: NewAction) => NewAction): NewAction[] {
    return NEW_ACTIONS.map(action => (action.id === 'receive_payment' ? change(action) : action))
}

describe('transactionActions', () => {
    it('lists Invoice, Estimate, Sales receipt, Receive payment and Credit memo in NEW_ACTIONS order', () => {
        expect(transactionActions()).toEqual([
            { id: 'invoice', label: 'Invoice', testId: 'customer-new-invoice' },
            { id: 'estimate', label: 'Estimate', testId: 'customer-new-estimate' },
            { id: 'sales_receipt', label: 'Sales receipt', testId: 'customer-new-sales-receipt' },
            {
                id: 'receive_payment',
                label: 'Receive payment',
                testId: 'customer-new-receive-payment',
            },
            { id: 'credit_memo', label: 'Credit memo', testId: 'customer-new-credit-memo' },
        ])
    })

    it('leaves out an action that does not take a customer', () => {
        const actions = withReceivePayment(({ takesCustomer: _flag, ...rest }) => rest)
        expect(transactionActions(actions).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
            'credit_memo',
        ])
    })

    it('leaves out an action that is not available', () => {
        const actions = withReceivePayment(action => ({ ...action, available: false }))
        expect(transactionActions(actions).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
            'credit_memo',
        ])
    })
})

describe('transactionHref', () => {
    it('opens the new document with the customer', () => {
        expect(transactionHref('invoice', 'abc')).toBe('books/invoices/new?customer=abc')
        expect(transactionHref('estimate', 'abc')).toBe('books/estimates/new?customer=abc')
        expect(transactionHref('sales_receipt', 'abc')).toBe(
            'books/sales-receipts/new?customer=abc'
        )
        expect(transactionHref('receive_payment', 'abc')).toBe('books/payments/new?customer=abc')
    })

    it('opens a new credit memo with the customer', () => {
        expect(transactionHref('credit_memo', 'abc')).toBe('books/credit-memos/new?customer=abc')
    })
})
