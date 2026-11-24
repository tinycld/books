// What a sidebar shortcut can point to, with the label, icon and route the sidebar draws it
// with. A screen and a transaction form are known here. A report and a register are known
// only with data (the report's id and title, the account's name), so the sidebar reads
// those rows itself; this module has only their icon and route.
import type { LucideIcon } from 'lucide-react-native'
import { BarChart3, BookOpen, Package, Plus, Truck, Users } from 'lucide-react-native'
import { NEW_ACTIONS, type NewAction } from './new-actions'
import {
    availableOnly,
    LIST_ENTRIES,
    type ListEntry,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
} from './shell-nav'
import type { Shortcut } from './sidebar-shortcuts'

export interface ShortcutTarget {
    shortcut: Shortcut
    label: string
    icon: LucideIcon
    href: string
    params?: Record<string, string>
    // A transaction form: only a user who can write gets it.
    needsWrite: boolean
}

export const REPORT_SHORTCUT_ICON = BarChart3
export const REGISTER_SHORTCUT_ICON = BookOpen
export const REGISTER_SHORTCUT_ROUTE = 'books/accounts/[id]'

const LIST_ICONS: Record<string, LucideIcon> = {
    customers: Users,
    vendors: Truck,
    products: Package,
}

// The actions whose label is what you do, not what you make.
const VERB_ACTIONS = new Set(['pay_bills', 'receive_payment'])

function newLabel(action: NewAction): string {
    if (VERB_ACTIONS.has(action.id)) return action.label
    return `New ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}`
}

// Every sidebar entry, then each list that has no sidebar entry of its own (a list with
// one, Chart of Accounts and Journal Entries, is listed once, under the sidebar's label).
export function screenTargets(
    sidebar: readonly SidebarEntry[] = SIDEBAR_ENTRIES,
    lists: readonly ListEntry[] = LIST_ENTRIES
): ShortcutTarget[] {
    const fromSidebar = availableOnly(sidebar).map(
        (entry): ShortcutTarget => ({
            shortcut: { kind: 'screen', ref: entry.id },
            label: entry.label,
            icon: entry.icon,
            href: entry.href,
            params: entry.params,
            needsWrite: false,
        })
    )
    const taken = new Set(fromSidebar.map(target => target.shortcut.ref))
    const fromLists = availableOnly(lists)
        .filter(entry => !taken.has(entry.id))
        .map(
            (entry): ShortcutTarget => ({
                shortcut: { kind: 'screen', ref: entry.id },
                label: entry.label,
                icon: LIST_ICONS[entry.id] ?? BookOpen,
                href: entry.href,
                needsWrite: false,
            })
        )
    return [...fromSidebar, ...fromLists]
}

export function newTargets(actions: readonly NewAction[] = NEW_ACTIONS): ShortcutTarget[] {
    return availableOnly(actions).map(
        (action): ShortcutTarget => ({
            shortcut: { kind: 'new', ref: action.id },
            label: newLabel(action),
            icon: Plus,
            href: action.href,
            needsWrite: true,
        })
    )
}

export const SCREEN_TARGETS = screenTargets()
export const NEW_TARGETS = newTargets()

// The screens and forms a user can add as a shortcut. A reader gets no form.
export function staticTargets(
    canWrite: boolean,
    targets: readonly ShortcutTarget[] = [...SCREEN_TARGETS, ...NEW_TARGETS]
): ShortcutTarget[] {
    return targets.filter(target => canWrite || !target.needsWrite)
}

// The target of a `screen` or `new` shortcut. Null for a report or a register (the sidebar
// reads those), for a ref this build does not know, and for a form when the user cannot
// write: the sidebar draws nothing for a null.
export function staticTarget(
    shortcut: Shortcut,
    canWrite: boolean,
    targets?: readonly ShortcutTarget[]
): ShortcutTarget | null {
    if (shortcut.kind !== 'screen' && shortcut.kind !== 'new') return null
    const found = staticTargets(canWrite, targets).find(
        target => target.shortcut.kind === shortcut.kind && target.shortcut.ref === shortcut.ref
    )
    return found ?? null
}
