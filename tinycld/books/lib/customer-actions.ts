import {
    RECORD_MENU_LABELS,
    type RecordMenuItem,
    recordMenuItems,
    recordMenuTestIds,
} from './record-menu'

export type CustomerMenuItem = RecordMenuItem | 'add-sub'

// The row menu, in order. A reader gets no menu at all; only a top-level customer can
// take sub-customers (one level).
export function customerMenuItems(
    row: { isTopLevel: boolean; inactive: boolean },
    canWrite: boolean
): CustomerMenuItem[] {
    const items: CustomerMenuItem[] = recordMenuItems(row, canWrite)
    if (items.length === 0 || !row.isTopLevel) return items
    return [items[0], 'add-sub', ...items.slice(1)]
}

export const CUSTOMER_MENU_LABELS: Record<CustomerMenuItem, string> = {
    ...RECORD_MENU_LABELS,
    'add-sub': 'Add sub-customer',
}

export const CUSTOMER_MENU_TEST_IDS: Record<CustomerMenuItem, string> = {
    ...recordMenuTestIds('customer'),
    'add-sub': 'customer-menu-add-sub',
}

export type DeleteDecision = 'delete' | 'make-inactive' | 'close-only'

// The server refuses a delete while sub-customers exist and Make inactive while any of
// them is active, so the dialog offers only what the server accepts.
export function deleteDecision(subCustomers: readonly { inactive: boolean }[]): DeleteDecision {
    if (subCustomers.length === 0) return 'delete'
    if (subCustomers.every(sub => sub.inactive)) return 'make-inactive'
    return 'close-only'
}
