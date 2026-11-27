import { describe, expect, it } from 'vitest'
import { isReadOnlyRoute, searchTarget } from '../tinycld/books/lib/search-target'

// Write-off spec §3.5: the write-off page has no form, so Back steps past write-off pages
// of the same route right below it, as it does for bill payments.
describe('isReadOnlyRoute', () => {
    it('is true for the write-off page', () => {
        expect(isReadOnlyRoute('write-offs/[id]')).toBe(true)
    })
})

describe('searchTarget', () => {
    it('routes an account hit to its register', () => {
        expect(searchTarget('account:abc123')).toEqual({
            path: 'books/accounts/[id]',
            id: 'abc123',
        })
    })

    it('routes a journal entry hit to the entry screen', () => {
        expect(searchTarget('entry:xyz789')).toEqual({
            path: 'books/entries/[id]',
            id: 'xyz789',
        })
    })

    it('routes a customer hit to the customer', () => {
        expect(searchTarget('customer:abc123')).toEqual({
            path: 'books/customers/[id]',
            id: 'abc123',
        })
    })

    it('routes a vendor hit to the vendor', () => {
        expect(searchTarget('vendor:abc123')).toEqual({
            path: 'books/vendors/[id]',
            id: 'abc123',
        })
    })

    it('routes a product hit to the product', () => {
        expect(searchTarget('product:abc123')).toEqual({
            path: 'books/products/[id]',
            id: 'abc123',
        })
    })

    it('routes a transfer hit to the transfer screen', () => {
        expect(searchTarget('transfer:abc')).toEqual({
            path: 'books/transfers/[id]',
            id: 'abc',
        })
    })

    it('routes an invoice hit to the invoice screen', () => {
        expect(searchTarget('invoice:abc')).toEqual({
            path: 'books/invoices/[id]',
            id: 'abc',
        })
    })

    it('routes a sales receipt hit to the sales receipt screen', () => {
        expect(searchTarget('sales_receipt:abc')).toEqual({
            path: 'books/sales-receipts/[id]',
            id: 'abc',
        })
    })

    it('routes a credit memo hit to the credit memo screen', () => {
        expect(searchTarget('credit_memo:abc')).toEqual({
            path: 'books/credit-memos/[id]',
            id: 'abc',
        })
    })

    // Refund receipt spec §3.13: a refund receipt hit (kind refund_receipt) opens the refund.
    it('routes a refund receipt hit to the refund receipt screen', () => {
        expect(searchTarget('refund_receipt:abc')).toEqual({
            path: 'books/refund-receipts/[id]',
            id: 'abc',
        })
        expect(searchTarget('refund_receipt:')).toBeNull()
    })

    it('routes an estimate hit to the estimate screen', () => {
        expect(searchTarget('estimate:abc')).toEqual({
            path: 'books/estimates/[id]',
            id: 'abc',
        })
    })

    // Purchase order spec §3.9: a purchase order hit (kind purchase_order) opens the order.
    it('routes a purchase order hit to the purchase order screen', () => {
        expect(searchTarget('purchase_order:abc')).toEqual({
            path: 'books/purchase-orders/[id]',
            id: 'abc',
        })
        expect(searchTarget('purchase_order:')).toBeNull()
    })

    it('routes a bill hit to the bill screen', () => {
        expect(searchTarget('bill:abc')).toEqual({
            path: 'books/bills/[id]',
            id: 'abc',
        })
        expect(searchTarget('bill:')).toBeNull()
    })

    // Expense form spec §3.11: an expense hit (kind expense) opens the expense.
    it('routes an expense hit to the expense screen', () => {
        expect(searchTarget('expense:abc')).toEqual({
            path: 'books/expenses/[id]',
            id: 'abc',
        })
        expect(searchTarget('expense:')).toBeNull()
    })

    // Vendor credit spec §3.12: a vendor credit hit (kind vendor_credit) opens the credit.
    it('routes a vendor credit hit to the vendor credit screen', () => {
        expect(searchTarget('vendor_credit:abc')).toEqual({
            path: 'books/vendor-credits/[id]',
            id: 'abc',
        })
        expect(searchTarget('vendor_credit:')).toBeNull()
    })

    // Vendor refund spec §3.11: a vendor refund hit (kind vendor_refund) opens the refund.
    it('routes a vendor refund hit to the vendor refund screen', () => {
        expect(searchTarget('vendor_refund:abc')).toEqual({
            path: 'books/vendor-refunds/[id]',
            id: 'abc',
        })
        expect(searchTarget('vendor_refund:')).toBeNull()
    })

    // Write-off spec §4.3: a write-off hit (kind write_off) opens the write-off.
    it('routes a write-off hit to the write-off screen', () => {
        expect(searchTarget('write_off:abc')).toEqual({
            path: 'books/write-offs/[id]',
            id: 'abc',
        })
        expect(searchTarget('write_off:')).toBeNull()
    })

    // Bank deposit spec §3.7: a deposit hit (kind deposit) opens the deposit.
    it('routes a deposit hit to the deposit screen', () => {
        expect(searchTarget('deposit:abc')).toEqual({
            path: 'books/deposits/[id]',
            id: 'abc',
        })
        expect(searchTarget('deposit:')).toBeNull()
    })

    // Inventory-adjust spec §3.5: an adjustment hit (kind inventory_adjustment) opens the
    // adjustment.
    it('routes an inventory adjustment hit to the adjustment screen', () => {
        expect(searchTarget('inventory_adjustment:abc')).toEqual({
            path: 'books/inventory-adjustments/[id]',
            id: 'abc',
        })
        expect(searchTarget('inventory_adjustment:')).toBeNull()
    })

    // Receive payment spec §3.9: a payment hit (kind payment) opens the payment.
    it('routes a payment hit to the payment screen', () => {
        expect(searchTarget('payment:abc')).toEqual({
            path: 'books/payments/[id]',
            id: 'abc',
        })
        expect(searchTarget('payment:')).toBeNull()
    })

    // Pay-bills spec §3.11: a bill payment hit (kind bill_payment) opens the bill payment.
    it('routes a bill payment hit to the bill payment read view', () => {
        expect(searchTarget('bill_payment:abc')).toEqual({
            path: 'books/bill-payments/[id]',
            id: 'abc',
        })
        expect(searchTarget('bill_payment:')).toBeNull()
    })

    it('ignores an id it does not know', () => {
        expect(searchTarget('quote:1')).toBeNull()
        expect(searchTarget('invoice:')).toBeNull()
        expect(searchTarget('account:')).toBeNull()
        expect(searchTarget('entry:')).toBeNull()
        expect(searchTarget('customer:')).toBeNull()
        expect(searchTarget('vendor:')).toBeNull()
        expect(searchTarget('plain')).toBeNull()
    })

    it('ignores a kind that names an inherited object member', () => {
        expect(searchTarget('constructor:x')).toBeNull()
        expect(searchTarget('toString:x')).toBeNull()
        expect(searchTarget('__proto__:x')).toBeNull()
    })
})
