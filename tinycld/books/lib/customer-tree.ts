import type { BooksCustomers } from '../types'
import type { PartyListRow } from './party-list'

export type TreeCustomer = Pick<
    BooksCustomers,
    'id' | 'display_name' | 'company' | 'email' | 'phone' | 'parent' | 'inactive'
>

// The list's rows from the server, in sort_key order, which is already the tree: each
// top-level customer is followed by its sub-customers (server/sort_keys.go). A search
// keeps only matching rows, so a matching sub-customer whose parent did not match
// brings `parentRow` (the query's materialized parent), shown above it once. A
// sub-customer whose parent has not loaded yet is a top-level row.
export function customerTreeRows<T extends TreeCustomer>(
    rows: readonly (T & { parentRow: T | undefined })[]
): PartyListRow<T>[] {
    const out: PartyListRow<T>[] = []
    let shownParent = ''
    for (const row of rows) {
        if (row.parent === '') {
            out.push({ party: row, depth: 0 })
            shownParent = row.id
            continue
        }
        if (row.parent !== shownParent && row.parentRow) {
            out.push({ party: row.parentRow, depth: 0 })
            shownParent = row.parentRow.id
        }
        out.push({ party: row, depth: row.parent === shownParent ? 1 : 0 })
    }
    return out
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
