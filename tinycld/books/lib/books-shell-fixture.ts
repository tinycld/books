// Synthetic data for the helix reference route and the shell's gate-2 captures.
// Full columns, so the three-column layout and long labels are exercised even
// though phase 1 ships only the Other column's journal entry.
export interface FixtureAction {
    label: string
}

export interface FixtureColumn {
    heading: string
    actions: FixtureAction[]
}

export const NEW_MENU_FIXTURE: FixtureColumn[] = [
    {
        heading: 'Customers',
        actions: [{ label: 'Invoice' }, { label: 'Receive payment' }, { label: 'Credit memo' }],
    },
    {
        heading: 'Vendors',
        actions: [{ label: 'Expense' }, { label: 'Bill' }, { label: 'Vendor credit' }],
    },
    { heading: 'Other', actions: [{ label: 'Journal entry' }] },
]

export const LISTS_FIXTURE = [
    { label: 'Accounts', description: 'Chart of accounts' },
    { label: 'Customers', description: 'Who you invoice' },
]
