import type { BooksCustomers } from '../types'
import {
    comparePartyNames,
    type PartyListRow,
    type PartyListViewState,
    partyListViewState,
    partyMatches,
} from './party-list'

export type TreeCustomer = Pick<
    BooksCustomers,
    'id' | 'display_name' | 'company' | 'email' | 'phone' | 'parent' | 'inactive'
>

export type CustomerListRow<T extends TreeCustomer> = { customer: T; depth: 0 | 1 }

export const compareCustomerNames = comparePartyNames

export const customerMatches = partyMatches

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

// The customer tree in the shared list's row shape.
export function customerPartyRows<T extends TreeCustomer>(
    customers: readonly T[],
    filters: { query: string; showInactive: boolean }
): PartyListRow<T>[] {
    return customerRows(customers, filters).map(row => ({
        party: row.customer,
        depth: row.depth,
    }))
}

export type CustomerListViewState = PartyListViewState

export function customerListViewState(input: {
    isReady: boolean
    isError: boolean
    customers: readonly TreeCustomer[]
    rowCount: number
    query: string
    showInactive: boolean
}): CustomerListViewState {
    return partyListViewState({ ...input, records: input.customers })
}

// The parent picker shows this many customers at a time.
export const PICKER_LIMIT = 50

// The parent picker's options: customers whose display name holds the term (any case;
// `%` and `_` are plain characters), the customer being edited left out, the first
// PICKER_LIMIT in the order given.
export function pickerOptions<T extends Pick<BooksCustomers, 'id' | 'display_name'>>(
    rows: readonly T[],
    opts: { term: string; selfId: string }
): T[] {
    const term = opts.term.trim().toLowerCase()
    const options: T[] = []
    for (const row of rows) {
        if (options.length === PICKER_LIMIT) break
        if (row.id === opts.selfId) continue
        if (term !== '' && !row.display_name.toLowerCase().includes(term)) continue
        options.push(row)
    }
    return options
}

// `?parent=<id>` starts a sub-customer only under an active top-level customer;
// anything else starts a top-level customer.
export function usableParentId(
    candidate: Pick<BooksCustomers, 'id' | 'parent' | 'inactive'> | undefined
): string {
    if (!candidate || candidate.parent || candidate.inactive) return ''
    return candidate.id
}
