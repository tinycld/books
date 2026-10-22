import type { LucideIcon } from 'lucide-react-native'
import { BookOpen, FileText, List } from 'lucide-react-native'
import type { BooksAccessState } from './access'

export interface SidebarEntry {
    id: string
    label: string
    icon: LucideIcon
    href: string
    group?: 'accounting'
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
        id: 'accounts',
        label: 'Chart of Accounts',
        icon: BookOpen,
        href: 'books/accounts',
        group: 'accounting',
        available: false,
    },
    {
        id: 'entries',
        label: 'Journal Entries',
        icon: FileText,
        href: 'books/entries',
        group: 'accounting',
        available: false,
    },
]

export const NEW_ACTIONS: NewAction[] = [
    {
        id: 'journal-entry',
        label: 'Journal entry',
        href: 'books/entries/new',
        column: 'other',
        available: false,
    },
]

export const LIST_ENTRIES: ListEntry[] = [
    {
        id: 'accounts',
        label: 'Accounts',
        description: 'Chart of accounts',
        href: 'books/accounts',
        available: false,
    },
]

const COLUMNS: readonly { column: NewAction['column']; heading: string }[] = [
    { column: 'customers', heading: 'Customers' },
    { column: 'vendors', heading: 'Vendors' },
    { column: 'other', heading: 'Other' },
]

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
        top: entries.filter(entry => entry.group !== 'accounting'),
        accounting: entries.filter(entry => entry.group === 'accounting'),
    }
}

export function isActivePath(pathname: string, entry: SidebarEntry): boolean {
    return pathname.endsWith(`/${entry.href}`) || pathname.includes(`/${entry.href}/`)
}
