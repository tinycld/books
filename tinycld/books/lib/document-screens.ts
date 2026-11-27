// The numbered document collections whose route takes a URL key (lib/record-key.ts), with
// the name the stack gives the route's screen. A plain module, so a lib that builds a
// document's path (lib/stock-move-link.ts) reads it with no React import;
// hooks/useRouteRecordId.ts re-exports it for its callers.
export const DOCUMENT_SCREENS = {
    books_invoices: 'invoices/[id]',
    books_estimates: 'estimates/[id]',
    books_purchase_orders: 'purchase-orders/[id]',
    books_sales_receipts: 'sales-receipts/[id]',
    books_payments: 'payments/[id]',
    books_credit_memos: 'credit-memos/[id]',
    books_refund_receipts: 'refund-receipts/[id]',
    books_statements: 'statements/[id]',
    books_bills: 'bills/[id]',
    books_expenses: 'expenses/[id]',
    books_bill_payments: 'bill-payments/[id]',
    books_vendor_credits: 'vendor-credits/[id]',
    books_vendor_refunds: 'vendor-refunds/[id]',
    books_deposits: 'deposits/[id]',
    books_write_offs: 'write-offs/[id]',
    books_inventory_adjustments: 'inventory-adjustments/[id]',
} as const

export type DocumentCollectionName = keyof typeof DOCUMENT_SCREENS
