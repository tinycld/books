// The actions of the Books New menu. Apart from lib/shell-nav.ts, which holds the sidebar's
// icons, so a module that needs only the actions (lib/sales-lists.ts, read by the e2e
// helpers in Node) does not load the icon library.

export interface NewAction {
    id: string
    label: string
    href: string
    column: 'customers' | 'vendors' | 'other'
    available: boolean
    // A transaction for one customer: the customer page's New transaction menu lists it
    // and opens it with `?customer=<id>`.
    takesCustomer?: true
}

export const NEW_ACTIONS: NewAction[] = [
    {
        id: 'customer',
        label: 'Customer',
        href: 'books/customers/new',
        column: 'customers',
        available: true,
    },
    {
        id: 'invoice',
        label: 'Invoice',
        href: 'books/invoices/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'estimate',
        label: 'Estimate',
        href: 'books/estimates/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'sales_receipt',
        label: 'Sales receipt',
        href: 'books/sales-receipts/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'receive_payment',
        label: 'Receive payment',
        href: 'books/payments/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'credit_memo',
        label: 'Credit memo',
        href: 'books/credit-memos/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'vendor',
        label: 'Vendor',
        href: 'books/vendors/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'bill',
        label: 'Bill',
        href: 'books/bills/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'pay_bills',
        label: 'Pay bills',
        href: 'books/pay-bills',
        column: 'vendors',
        available: true,
    },
    {
        id: 'expense',
        label: 'Expense',
        href: 'books/expenses/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'vendor_credit',
        label: 'Vendor credit',
        href: 'books/vendor-credits/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'journal-entry',
        label: 'Journal entry',
        href: 'books/entries/new',
        column: 'other',
        available: true,
    },
    {
        id: 'transfer',
        label: 'Transfer',
        href: 'books/transfers/new',
        column: 'other',
        available: true,
    },
    {
        id: 'product',
        label: 'Product or service',
        href: 'books/products/new',
        column: 'other',
        available: true,
    },
]
