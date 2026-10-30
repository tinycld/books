export type RecordMenuItem = 'edit' | 'make-inactive' | 'make-active' | 'delete'

// The row menu, in order. A reader gets no menu at all.
export function recordMenuItems(row: { inactive: boolean }, canWrite: boolean): RecordMenuItem[] {
    if (!canWrite) return []
    return ['edit', row.inactive ? 'make-active' : 'make-inactive', 'delete']
}

export const RECORD_MENU_LABELS: Record<RecordMenuItem, string> = {
    edit: 'Edit',
    'make-inactive': 'Make inactive',
    'make-active': 'Make active',
    delete: 'Delete',
}

// Make inactive and Make active are one slot in the menu, so they share a test id.
export function recordMenuTestIds(prefix: string): Record<RecordMenuItem, string> {
    return {
        edit: `${prefix}-menu-edit`,
        'make-inactive': `${prefix}-menu-toggle-inactive`,
        'make-active': `${prefix}-menu-toggle-inactive`,
        delete: `${prefix}-menu-delete`,
    }
}

// The items that start a write; they wait while another write is in flight.
export const RECORD_MENU_WRITES: ReadonlySet<string> = new Set([
    'make-inactive',
    'make-active',
    'delete',
])
