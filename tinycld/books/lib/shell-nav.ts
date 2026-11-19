import type { LucideIcon } from 'lucide-react-native'
import {
    BarChart3,
    BookOpen,
    FileText,
    Landmark,
    List,
    Percent,
    Receipt,
    Settings,
    ShoppingCart,
} from 'lucide-react-native'
import type { BooksAccessState } from './access'
import { NEW_ACTIONS, type NewAction } from './new-actions'

export interface SidebarEntry {
    id: string
    label: string
    icon: LucideIcon
    href: string
    // Other paths the entry is active on, as `href` is: the path itself and every path
    // under it.
    activePaths?: readonly string[]
    params?: Record<string, string>
    group?: 'accounting' | 'settings'
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
    { id: 'banking', label: 'Banking', icon: Landmark, href: 'books/banking', available: true },
    // All sales; the six kind tabs and every sales document keep the entry active.
    {
        id: 'sales',
        label: 'Sales',
        icon: Receipt,
        href: 'books/sales',
        activePaths: [
            'books/invoices',
            'books/estimates',
            'books/sales-receipts',
            'books/payments',
            'books/credit-memos',
            'books/refund-receipts',
        ],
        available: true,
    },
    // All purchases; Pay Bills, the five kind tabs and every purchase document keep the
    // entry active.
    {
        id: 'expenses',
        label: 'Expenses',
        icon: ShoppingCart,
        href: 'books/purchases',
        activePaths: [
            'books/pay-bills',
            'books/bills',
            'books/expenses',
            'books/bill-payments',
            'books/vendor-credits',
            'books/vendor-refunds',
        ],
        available: true,
    },
    { id: 'lists', label: 'Lists', icon: List, href: 'books/lists', available: true },
    {
        id: 'reports',
        label: 'Reports',
        icon: BarChart3,
        href: 'reports',
        params: { package: 'books' },
        available: true,
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
        id: 'taxes',
        label: 'Taxes',
        icon: Percent,
        href: 'books/taxes',
        group: 'settings',
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

function isOnPath(pathname: string, path: string): boolean {
    return pathname.endsWith(`/${path}`) || pathname.includes(`/${path}/`)
}

export function isActivePath(pathname: string, entry: SidebarEntry): boolean {
    const paths = [entry.href, ...(entry.activePaths ?? [])]
    return paths.some(path => isOnPath(pathname, path))
}

// The entry, customer, vendor, product, transfer, invoice, sales receipt, credit memo,
// refund receipt, estimate, bill, expense, vendor credit, vendor refund and payment forms,
// Pay Bills, and the entry, transfer, invoice, sales receipt, credit memo, refund receipt,
// estimate, bill, expense, vendor credit, vendor refund, payment and bill payment views
// own the bottom of the phone screen, so the New button stays off them. The pattern needs
// a child segment, so a bare path keeps the button: a list (`/entries`, `/customers`,
// `/vendors`, `/products`, the Sales lists `/invoices`, `/estimates`, `/sales-receipts`,
// `/payments`, `/credit-memos`, `/refund-receipts`, and the purchase lists `/bills`,
// `/expenses`, `/bill-payments`, `/vendor-credits`, `/vendor-refunds`), or no screen at
// all (transfers have no list). Pay Bills has no id: `/pay-bills` itself is the form.
const FAB_FREE_SCREEN =
    /\/books\/((entries|customers|vendors|products|transfers|invoices|sales-receipts|credit-memos|refund-receipts|estimates|bills|expenses|vendor-credits|vendor-refunds|payments|bill-payments)\/[^/]+|pay-bills)\/?$/

export function hidesNewFab(pathname: string): boolean {
    return FAB_FREE_SCREEN.test(pathname)
}
