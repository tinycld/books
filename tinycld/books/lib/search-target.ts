// Where a federated search hit opens. The server (server/search.go) prefixes
// each row id with its kind; the screens below are the account register, the
// journal entry screen, the transfer screen, the customer screen, the vendor
// screen, the product screen, the invoice screen, the sales receipt screen
// (drafts included for both documents), the estimate screen, the bill and
// expense screens (drafts included), the payment screen (drafts included), and the
// bill payment read view.
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
    ['estimate', 'books/estimates/[id]'],
    ['bill', 'books/bills/[id]'],
    ['expense', 'books/expenses/[id]'],
    ['payment', 'books/payments/[id]'],
    ['bill_payment', 'books/bill-payments/[id]'],
])

export function searchTarget(rowId: string): SearchTarget | null {
    const [kind, id] = rowId.split(':')
    const path = PATHS.get(kind)
    if (!path || !id) return null
    return { path, id }
}

// The routes that only show a record: a bill payment has no draft, so its route never
// holds a form.
const READ_ONLY_PATHS = new Set(['books/bill-payments/[id]'])

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
