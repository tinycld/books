import type { BooksCustomers } from '../types'

export type TreeCustomer = Pick<
    BooksCustomers,
    'id' | 'display_name' | 'company' | 'email' | 'phone' | 'parent' | 'inactive'
>

export type CustomerListRow<T extends TreeCustomer> = { customer: T; depth: 0 | 1 }

export function compareCustomerNames(a: TreeCustomer, b: TreeCustomer): number {
    const byName = a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: 'base',
    })
    if (byName !== 0) return byName
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

export function customerMatches(customer: TreeCustomer, query: string): boolean {
    const term = query.trim().toLowerCase()
    if (term === '') return true
    const fields = [customer.display_name, customer.company, customer.email, customer.phone]
    // A row can arrive without company, email or phone; searching must not throw on it.
    return fields.some(value => (value ?? '').toLowerCase().includes(term))
}

// Top-level customers sorted by name, each followed by its sub-customers. A search
// keeps a parent that matches or has a matching sub-customer, and under it only the
// sub-customers that match. A sub-customer whose parent is not in the list (hidden as
// inactive, or missing) is a top-level row.
export function customerRows<T extends TreeCustomer>(
    customers: readonly T[],
    filters: { query: string; showInactive: boolean }
): CustomerListRow<T>[] {
    const shown = customers.filter(c => filters.showInactive || !c.inactive)
    const ids = new Set(shown.map(c => c.id))
    const children = new Map<string, T[]>()
    const topLevel: T[] = []
    for (const customer of shown) {
        if (customer.parent === '' || !ids.has(customer.parent)) {
            topLevel.push(customer)
            continue
        }
        const siblings = children.get(customer.parent) ?? []
        siblings.push(customer)
        children.set(customer.parent, siblings)
    }

    const rows: CustomerListRow<T>[] = []
    for (const parent of topLevel.sort(compareCustomerNames)) {
        const subs = (children.get(parent.id) ?? [])
            .filter(c => customerMatches(c, filters.query))
            .sort(compareCustomerNames)
        if (!customerMatches(parent, filters.query) && subs.length === 0) continue
        rows.push({ customer: parent, depth: 0 })
        for (const sub of subs) rows.push({ customer: sub, depth: 1 })
    }
    return rows
}

export type CustomerListViewState =
    | 'loading'
    | 'error'
    | 'empty'
    | 'no-match'
    | 'all-inactive'
    | 'ready'

// 'all-inactive' is only the default view hiding every customer: a search that finds
// nothing is 'no-match' whatever the inactive filter.
export function customerListViewState(input: {
    isReady: boolean
    isError: boolean
    customers: readonly TreeCustomer[]
    rowCount: number
    query: string
    showInactive: boolean
}): CustomerListViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.customers.length === 0) return 'empty'
    if (input.rowCount > 0) return 'ready'
    const hidesOnlyInactive =
        input.query.trim() === '' && !input.showInactive && input.customers.every(c => c.inactive)
    if (hidesOnlyInactive) return 'all-inactive'
    return 'no-match'
}
