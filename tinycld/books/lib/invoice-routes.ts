// Paths without the org prefix; callers pass them through `useOrgHref`.

const NEW_INVOICE = 'books/invoices/new'

// The new-invoice route with only the params given. `fresh` is a nonce: a replace
// from one new form to another (Post & new) keys a fresh form on it.
export function invoiceNewHref(input: {
    customer?: string
    fresh?: string
    replaces?: string
    copy?: string
}): string {
    const params = new URLSearchParams()
    for (const key of ['replaces', 'copy', 'customer', 'fresh'] as const) {
        const value = input[key]
        if (value) params.set(key, value)
    }
    const query = params.toString()
    return query === '' ? NEW_INVOICE : `${NEW_INVOICE}?${query}`
}

export function invoiceHref(id: string): string {
    return `books/invoices/${id}`
}
