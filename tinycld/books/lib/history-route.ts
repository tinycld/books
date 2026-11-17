import type { SalesDocKey } from './sales-document-kinds'

// The Books app path of a record's history screen (screens/history/[collection]/[id].tsx).
export function historyHref(collection: string, id: string): string {
    return `books/history/${collection}/${id}`
}

// The collection each document kind is stored in, which its history is read by. The one
// map of kind to collection: audit-record-route.ts reads it the other way.
export const DOCUMENT_COLLECTIONS: Record<SalesDocKey, string> = {
    invoice: 'books_invoices',
    sales_receipt: 'books_sales_receipts',
    credit_memo: 'books_credit_memos',
    estimate: 'books_estimates',
    bill: 'books_bills',
    expense: 'books_expenses',
}
