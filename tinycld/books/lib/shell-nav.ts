import type { LucideIcon } from 'lucide-react-native'
import { BarChart3, BookOpen, FileText, List, Settings } from 'lucide-react-native'
import type { BooksAccessState } from './access'
import { hasAvailableReport } from './report-registry'

export interface SidebarEntry {
    id: string
    label: string
    icon: LucideIcon
    href: string
    group?: 'accounting' | 'settings'
    available: boolean
}

export interface NewAction {
    id: string
    label: string
    href: string
    column: 'customers' | 'vendors' | 'other'
    available: boolean
}

export interface ListEntry {
    id: string
    label: string
    description: string
    href: string
    available: boolean
}

export interface NewMenuColumn {
    heading: string
    actions: NewAction[]
}

export const SIDEBAR_ENTRIES: SidebarEntry[] = [
    { id: 'lists', label: 'Lists', icon: List, href: 'books/lists', available: true },
    {
        id: 'reports',
        label: 'Reports',
        icon: BarChart3,
        href: 'books/reports',
        available: hasAvailableReport(),
    },
    {
        id: 'accounts',
        label: 'Chart of Accounts',
        icon: BookOpen,
        href: 'books/accounts',
        group: 'accounting',
        available: true,
    },
    {
        id: 'entries',
        label: 'Journal Entries',
        icon: FileText,
        href: 'books/entries',
        group: 'accounting',
        available: true,
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        href: 'books/settings',
        group: 'settings',
        available: true,
    },
]

export const NEW_ACTIONS: NewAction[] = [
    {
        id: 'customer',
        label: 'Customer',
        href: 'books/customers/new',
        column: 'customers',
        available: true,
    },
    {
        id: 'vendor',
        label: 'Vendor',
        href: 'books/vendors/new',
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
    {
        id: 'product',
        label: 'Product or service',
        href: 'books/products/new',
        column: 'other',
        available: true,
    },
]

export const LIST_ENTRIES: ListEntry[] = [
    {
        id: 'accounts',
        label: 'Accounts',
        description: 'Chart of accounts',
        href: 'books/accounts',
        available: true,
    },
    {
        id: 'entries',
        label: 'Journal entries',
        description: 'Manual entries',
        href: 'books/entries',
        available: true,
    },
    {
        id: 'customers',
        label: 'Customers',
        description: 'People and companies you sell to',
        href: 'books/customers',
        available: true,
    },
    {
        id: 'vendors',
        label: 'Vendors',
        description: 'People and companies you buy from',
        href: 'books/vendors',
        available: true,
    },
    {
        id: 'products',
        label: 'Products and services',
        description: 'What you sell and buy',
        href: 'books/products',
        available: true,
    },
]

const COLUMNS: readonly { column: NewAction['column']; heading: string }[] = [
    { column: 'customers', heading: 'Customers' },
    { column: 'vendors', heading: 'Vendors' },
    { column: 'other', heading: 'Other' },
]

export const isNewActionAvailable = (id: string, actions: readonly NewAction[] = NEW_ACTIONS) =>
    actions.find(action => action.id === id)?.available ?? false

export function availableOnly<T extends { available: boolean }>(entries: readonly T[]): T[] {
    return entries.filter(entry => entry.available)
}

export function newMenuColumns(actions: readonly NewAction[]): NewMenuColumn[] {
    const available = availableOnly(actions)
    return COLUMNS.map(({ column, heading }) => ({
        heading,
        actions: available.filter(action => action.column === column),
    })).filter(column => column.actions.length > 0)
}

export function newMenuForAccess(
    access: BooksAccessState,
    actions: readonly NewAction[] = NEW_ACTIONS
): NewMenuColumn[] {
    if (!access.canWrite) return []
    return newMenuColumns(actions)
}

export function sidebarSections(entries: readonly SidebarEntry[]) {
    return {
        top: entries.filter(entry => entry.group === undefined),
        accounting: entries.filter(entry => entry.group === 'accounting'),
        end: entries.filter(entry => entry.group === 'settings'),
    }
}

export function isActivePath(pathname: string, entry: SidebarEntry): boolean {
    return pathname.endsWith(`/${entry.href}`) || pathname.includes(`/${entry.href}/`)
}

// The entry, customer, vendor and product forms and the entry view own the bottom of
// the phone screen, so the New button stays off them. `/entries`, `/customers`,
// `/vendors` and `/products` alone are the lists, which keep them.
export function hidesNewFab(pathname: string): boolean {
    return /\/books\/(entries|customers|vendors|products)\/[^/]+\/?$/.test(pathname)
}
