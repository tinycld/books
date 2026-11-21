// Where a federated search hit opens. The server (server/search.go) prefixes
// each row id with its kind; the screens below are the account register, the
// journal entry screen, the transfer screen, the customer screen, the vendor
// screen, the product screen, the invoice screen, the sales receipt screen, the
// credit memo screen (drafts included for the three documents), the refund receipt screen
// (drafts included), the estimate screen, the
// bill, expense and vendor credit screens (drafts included), the payment screen (drafts
// included), the bill payment read view, the vendor refund screen (drafts included), the
// write-off page, and the deposit screen (drafts included).
export interface SearchTarget {
    path: string
    id: string
}

// A Map, so a kind that names an inherited object member (`constructor`,
// `__proto__`) finds no path.
const PATHS = new Map([
    ['account', 'books/accounts/[id]'],
    ['entry', 'books/entries/[id]'],
    ['transfer', 'books/transfers/[id]'],
    ['customer', 'books/customers/[id]'],
    ['vendor', 'books/vendors/[id]'],
    ['product', 'books/products/[id]'],
    ['invoice', 'books/invoices/[id]'],
    ['sales_receipt', 'books/sales-receipts/[id]'],
    ['credit_memo', 'books/credit-memos/[id]'],
    ['refund_receipt', 'books/refund-receipts/[id]'],
    ['estimate', 'books/estimates/[id]'],
    ['bill', 'books/bills/[id]'],
    ['expense', 'books/expenses/[id]'],
    ['vendor_credit', 'books/vendor-credits/[id]'],
    ['payment', 'books/payments/[id]'],
    ['bill_payment', 'books/bill-payments/[id]'],
    ['vendor_refund', 'books/vendor-refunds/[id]'],
    ['write_off', 'books/write-offs/[id]'],
    ['deposit', 'books/deposits/[id]'],
])

export function searchTarget(rowId: string): SearchTarget | null {
    const [kind, id] = rowId.split(':')
    const path = PATHS.get(kind)
    if (!path || !id) return null
    return { path, id }
}

// The routes that only show a record: a bill payment and a write-off have no draft, so
// their routes never hold a form.
const READ_ONLY_PATHS = new Set(['books/bill-payments/[id]', 'books/write-offs/[id]'])

/**
 * True when `routeName` (a Books stack route name, `bill-payments/[id]`) is a read-only
 * route: its screen holds no input, so Back may step past copies of it (useBackToEntries).
 */
export function isReadOnlyRoute(routeName: string): boolean {
    return READ_ONLY_PATHS.has(`books/${routeName}`)
}

/**
 * True when the target is a read-only route and `pathname` (the screen on top) is that
 * same route for a record: the search then replaces that screen, which holds no input to
 * lose, so the stack never holds two copies of one read view (lesson 15).
 */
export function opensOverSameReadView(target: SearchTarget, pathname: string): boolean {
    if (!READ_ONLY_PATHS.has(target.path)) return false
    const prefix = `/${target.path.replace('[id]', '')}`
    const at = pathname.indexOf(prefix)
    if (at < 0) return false
    const id = pathname.slice(at + prefix.length)
    return id !== '' && !id.includes('/')
}
