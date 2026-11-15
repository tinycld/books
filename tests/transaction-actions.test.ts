import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS, type NewAction } from '../tinycld/books/lib/shell-nav'
import { transactionActions, transactionHref } from '../tinycld/books/lib/transaction-actions'

// The customer page's New transaction menu (spec §3.3): the transactions of NEW_ACTIONS
// that take a customer, and where each one opens.

const receivePayment: NewAction = {
    id: 'receive_payment',
    label: 'Receive payment',
    href: 'books/payments/new',
    column: 'customers',
    available: true,
    takesCustomer: true,
}

describe('transactionActions', () => {
    it('lists Invoice, Estimate and Sales receipt in NEW_ACTIONS order', () => {
        expect(transactionActions()).toEqual([
            { id: 'invoice', label: 'Invoice', testId: 'customer-new-invoice' },
            { id: 'estimate', label: 'Estimate', testId: 'customer-new-estimate' },
            { id: 'sales_receipt', label: 'Sales receipt', testId: 'customer-new-sales-receipt' },
        ])
    })

    it('adds a later action that takes a customer', () => {
        const ids = transactionActions([...NEW_ACTIONS, receivePayment]).map(a => a.id)
        expect(ids).toEqual(['invoice', 'estimate', 'sales_receipt', 'receive_payment'])
        expect(transactionActions([receivePayment])).toEqual([
            {
                id: 'receive_payment',
                label: 'Receive payment',
                testId: 'customer-new-receive-payment',
            },
        ])
    })

    it('leaves out an action that does not take a customer', () => {
        const { takesCustomer: _flag, ...withoutFlag } = receivePayment
        expect(transactionActions([...NEW_ACTIONS, withoutFlag]).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
        ])
    })

    it('leaves out an action that is not available', () => {
        const unavailable = { ...receivePayment, available: false }
        expect(transactionActions([...NEW_ACTIONS, unavailable]).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
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
    })
})
