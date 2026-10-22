// Synthetic data for the helix reference route and the shell's gate-2 captures.
// Full columns, so the three-column layout and long labels are exercised even
// though phase 1 ships only the Other column's journal entry.
import type { ListEntry, NewAction } from './shell-nav'

export const NEW_ACTIONS_FIXTURE = [
    {
        id: 'invoice',
        label: 'Invoice',
        href: 'books/invoices/new',
        column: 'customers',
        available: true,
    },
    {
        id: 'receive-payment',
        label: 'Receive payment',
        href: 'books/payments/new',
        column: 'customers',
        available: true,
    },
    {
        id: 'credit-memo',
        label: 'Credit memo',
        href: 'books/credit-memos/new',
        column: 'customers',
        available: true,
    },
    {
        id: 'expense',
        label: 'Expense',
        href: 'books/expenses/new',
        column: 'vendors',
        available: true,
    },
    { id: 'bill', label: 'Bill', href: 'books/bills/new', column: 'vendors', available: true },
    {
        id: 'vendor-credit',
        label: 'Vendor credit',
        href: 'books/vendor-credits/new',
        column: 'vendors',
        available: true,
    },
    {
        id: 'journal-entry',
        label: 'Journal entry',
        href: 'books/entries/new',
        column: 'other',
        available: true,
    },
] as const satisfies readonly NewAction[]

export const LIST_ENTRIES_FIXTURE = [
    {
        id: 'accounts',
        label: 'Accounts',
        description: 'Chart of accounts',
        href: 'books/accounts',
        available: true,
    },
    {
        id: 'customers',
        label: 'Customers',
        description: 'Who you invoice',
        href: 'books/customers',
        available: true,
    },
] as const satisfies readonly ListEntry[]
