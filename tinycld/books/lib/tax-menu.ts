import type { DeleteDialogLine } from '../components/DeleteRecordDialog'

export type AgencyMenuItem = 'edit' | 'make-inactive' | 'make-active' | 'delete'

export type TaxMenuItem =
    | 'edit'
    | 'make-default'
    | 'remove-default'
    | 'make-inactive'
    | 'make-active'
    | 'delete'

// The agency card's menu, in order. A reader gets no menu at all.
export function agencyMenuItems(row: { inactive: boolean }, canWrite: boolean): AgencyMenuItem[] {
    if (!canWrite) return []
    return ['edit', row.inactive ? 'make-active' : 'make-inactive', 'delete']
}

// A rate's or group's menu, in order. Only an active row can become the default (the
// server refuses the rest), and the default offers its removal instead.
export function taxMenuItems(
    row: { inactive: boolean; isDefault: boolean },
    canWrite: boolean
): TaxMenuItem[] {
    if (!canWrite) return []
    if (row.inactive) return ['edit', 'make-active', 'delete']
    return ['edit', row.isDefault ? 'remove-default' : 'make-default', 'make-inactive', 'delete']
}

export const AGENCY_MENU_LABELS: Record<AgencyMenuItem, string> = {
    edit: 'Edit agency',
    'make-inactive': 'Make inactive',
    'make-active': 'Make active',
    delete: 'Delete',
}

export const taxMenuLabels: Record<TaxMenuItem, string> = {
    edit: 'Edit',
    'make-default': 'Make default',
    'remove-default': 'Remove default',
    'make-inactive': 'Make inactive',
    'make-active': 'Make active',
    delete: 'Delete',
}

// Each pair of opposite items is one slot in the menu, so the two share a test id.
export const AGENCY_MENU_TEST_IDS: Record<AgencyMenuItem, string> = {
    edit: 'tax-item-edit',
    'make-inactive': 'tax-item-inactive',
    'make-active': 'tax-item-inactive',
    delete: 'tax-item-delete',
}

export const TAX_MENU_TEST_IDS: Record<TaxMenuItem, string> = {
    ...AGENCY_MENU_TEST_IDS,
    'make-default': 'tax-item-default',
    'remove-default': 'tax-item-default',
}

// The items that start a write: they wait while another write runs and while writes
// are unavailable. Edit only opens a dialog, so it stays pressable offline.
export const TAX_MENU_WRITES: ReadonlySet<string> = new Set([
    'make-default',
    'remove-default',
    'make-inactive',
    'make-active',
    'delete',
])

export type TaxDeleteTarget = 'agency' | 'rate' | 'group'

const DELETE_LINE: Record<TaxDeleteTarget, string> = {
    agency: 'The agency is removed from Sales tax.',
    rate: 'The rate is removed from Sales tax. Customers whose default it is lose that default.',
    group: 'The group is removed from Sales tax. Customers whose default it is lose that default.',
}

export function deleteDialogCopy(
    target: TaxDeleteTarget,
    name: string
): { title: string; lines: DeleteDialogLine[]; confirmLabel: string } {
    return {
        title: `Delete ${target} “${name}”?`,
        lines: [{ key: 'what', text: DELETE_LINE[target], tone: 'plain' }],
        confirmLabel: `Delete ${target}`,
    }
}
