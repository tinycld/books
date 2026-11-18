import type { SalesDocKey } from './sales-document-kinds'

// The Books app path of a record's history screen (screens/history/[collection]/[id].tsx).
export function historyHref(collection: string, id: string): string {
    return `books/history/${collection}/${id}`
}

// The collection each document kind is stored in, which its history is read by. The one
// map of kind to collection: audit-record-route.ts reads it the other way. A vendor
// refund is not a sales document kind (its screen is the payment layer's), so its key is
// added beside them.
export const DOCUMENT_COLLECTIONS: Record<SalesDocKey | 'vendor_refund', string> = {
    invoice: 'books_invoices',
    sales_receipt: 'books_sales_receipts',
    credit_memo: 'books_credit_memos',
    estimate: 'books_estimates',
    bill: 'books_bills',
    expense: 'books_expenses',
    vendor_credit: 'books_vendor_credits',
    vendor_refund: 'books_vendor_refunds',
}
