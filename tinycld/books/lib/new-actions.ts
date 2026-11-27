// The actions of the Books New menu. Apart from lib/shell-nav.ts, which holds the sidebar's
// icons, so a module that needs only the actions (lib/sales-lists.ts, read by the e2e
// helpers in Node) does not load the icon library.

export interface NewAction {
    id: string
    label: string
    // The label in the sidebar's New section, when `label` needs its group to be clear
    // there. The customer and vendor pages keep `label`: the page names the group.
    sidebarLabel?: string
    href: string
    column: 'customers' | 'vendors' | 'other'
    available: boolean
    // A transaction for one customer: the customer page's New transaction menu lists it
    // and opens it with `?customer=<id>`.
    takesCustomer?: true
    // A transaction for one vendor: the vendor page's New transaction menu lists it and
    // opens it with `?vendor=<id>`.
    takesVendor?: true
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
        id: 'refund_receipt',
        label: 'Refund receipt',
        href: 'books/refund-receipts/new',
        column: 'customers',
        available: true,
        takesCustomer: true,
    },
    {
        id: 'statement',
        label: 'Statement',
        sidebarLabel: 'Customer statement',
        href: 'books/statements/new',
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
    // No `takesVendor` yet: lib/purchase-lists.ts `kindOfAction` reads every action that
    // takes a vendor as a purchase list kind, and the order joins the purchase lists later.
    {
        id: 'purchase_order',
        label: 'Purchase order',
        href: 'books/purchase-orders/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'bill',
        label: 'Bill',
        href: 'books/bills/new',
        column: 'vendors',
        available: true,
        takesVendor: true,
    },
    {
        id: 'pay_bills',
        label: 'Pay bills',
        href: 'books/pay-bills',
        column: 'vendors',
        available: true,
        takesVendor: true,
    },
    {
        id: 'expense',
        label: 'Expense',
        href: 'books/expenses/new',
        column: 'vendors',
        available: true,
        takesVendor: true,
    },
    {
        id: 'vendor_credit',
        label: 'Vendor credit',
        href: 'books/vendor-credits/new',
        column: 'vendors',
        available: true,
        takesVendor: true,
    },
    {
        id: 'vendor_refund',
        label: 'Vendor refund',
        href: 'books/vendor-refunds/new',
        column: 'vendors',
        available: true,
        takesVendor: true,
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
        id: 'deposit',
        label: 'Bank deposit',
        href: 'books/deposits/new',
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

// The label of an action in the sidebar: its New section and its filter results.
export function newActionSidebarLabel(action: NewAction): string {
    return action.sidebarLabel ?? action.label
}
