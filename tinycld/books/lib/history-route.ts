import type { SalesDocKey } from './sales-document-kinds'

// The Books app path of a record's history screen (screens/history/[collection]/[id].tsx).
export function historyHref(collection: string, id: string): string {
    return `books/history/${collection}/${id}`
}

// The collection each document kind is stored in, which its history is read by. The one
// map of kind to collection: audit-record-route.ts reads it the other way. A vendor
// refund, a write-off, a deposit and an inventory adjustment are not sales document kinds
// (each has a read page of its own), so their keys are added beside them.
export const DOCUMENT_COLLECTIONS: Record<
    SalesDocKey | 'vendor_refund' | 'write_off' | 'deposit' | 'inventory_adjustment',
    string
> = {
    invoice: 'books_invoices',
    sales_receipt: 'books_sales_receipts',
    credit_memo: 'books_credit_memos',
    estimate: 'books_estimates',
    bill: 'books_bills',
    expense: 'books_expenses',
    vendor_credit: 'books_vendor_credits',
    refund_receipt: 'books_refund_receipts',
    vendor_refund: 'books_vendor_refunds',
    write_off: 'books_write_offs',
    deposit: 'books_deposits',
    purchase_order: 'books_purchase_orders',
    inventory_adjustment: 'books_inventory_adjustments',
}
