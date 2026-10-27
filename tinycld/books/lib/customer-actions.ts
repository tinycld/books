export type CustomerMenuItem = 'edit' | 'add-sub' | 'make-inactive' | 'make-active' | 'delete'

// The row menu, in order. A reader gets no menu at all; only a top-level customer can
// take sub-customers (one level).
export function customerMenuItems(
    row: { isTopLevel: boolean; inactive: boolean },
    canWrite: boolean
): CustomerMenuItem[] {
    if (!canWrite) return []
    const items: CustomerMenuItem[] = ['edit']
    if (row.isTopLevel) items.push('add-sub')
    items.push(row.inactive ? 'make-active' : 'make-inactive')
    items.push('delete')
    return items
}

export type DeleteDecision = 'delete' | 'make-inactive' | 'close-only'

// The server refuses a delete while sub-customers exist and Make inactive while any of
// them is active, so the dialog offers only what the server accepts.
export function deleteDecision(subCustomers: readonly { inactive: boolean }[]): DeleteDecision {
    if (subCustomers.length === 0) return 'delete'
    if (subCustomers.every(sub => sub.inactive)) return 'make-inactive'
    return 'close-only'
}
