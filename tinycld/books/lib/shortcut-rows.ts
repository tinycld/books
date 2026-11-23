// The rows the Shortcuts section draws: each shortcut of the user's list with the label,
// icon and route it opens. A shortcut that has nothing to open is left out, not drawn dead.
import type { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { LucideIcon } from 'lucide-react-native'
import { shippedReportHref } from '../hooks/useShippedReportHref'
import { accountLabel } from './account-options'
import {
    REGISTER_SHORTCUT_ICON,
    REGISTER_SHORTCUT_ROUTE,
    REPORT_SHORTCUT_ICON,
    staticTarget,
} from './shortcut-catalog'
import { type Shortcut, shortcutKey } from './sidebar-shortcuts'

type OrgHref = ReturnType<typeof useOrgHref>

export interface ShortcutRow {
    key: string
    testID: string
    label: string
    icon: LucideIcon
    href: ReturnType<OrgHref>
}

export interface ShortcutReport {
    id: string
    title: string
    shippedKey: string
}

export interface ShortcutAccount {
    id: string
    number: string
    name: string
}

export interface ShortcutRowsInput {
    canWrite: boolean
    reports: readonly ShortcutReport[]
    accounts: readonly ShortcutAccount[]
    orgHref: OrgHref
}

const NO_PARAMS: Record<string, string> = {}

// A test id holds letters, digits and dashes only: `report` + `books.profit_and_loss` is
// `books-shortcut-report-books-profit-and-loss`.
export function shortcutTestId(shortcut: Shortcut): string {
    return `books-shortcut-${shortcut.kind}-${shortcut.ref.replace(/[^a-zA-Z0-9]/g, '-')}`
}

// A report shortcut holds the shipped key of a shipped report, or the row id of a saved one.
export function reportOfShortcut<R extends ShortcutReport>(
    ref: string,
    reports: readonly R[]
): R | undefined {
    return (
        reports.find(report => report.shippedKey !== '' && report.shippedKey === ref) ??
        reports.find(report => report.id === ref)
    )
}

function rowOf(shortcut: Shortcut, input: ShortcutRowsInput): ShortcutRow | null {
    const ids = { key: shortcutKey(shortcut), testID: shortcutTestId(shortcut) }
    if (shortcut.kind === 'report') {
        const report = reportOfShortcut(shortcut.ref, input.reports)
        if (!report) return null
        return {
            ...ids,
            label: report.title,
            icon: REPORT_SHORTCUT_ICON,
            href: shippedReportHref(input.orgHref, report.id, NO_PARAMS),
        }
    }
    if (shortcut.kind === 'register') {
        const account = input.accounts.find(candidate => candidate.id === shortcut.ref)
        if (!account) return null
        return {
            ...ids,
            label: accountLabel(account),
            icon: REGISTER_SHORTCUT_ICON,
            href: input.orgHref(REGISTER_SHORTCUT_ROUTE, { id: account.id }),
        }
    }
    const target = staticTarget(shortcut, input.canWrite)
    if (!target) return null
    return {
        ...ids,
        label: target.label,
        icon: target.icon,
        href: input.orgHref(target.href, target.params),
    }
}

// In the list's order. Left out: a report the reader cannot open (or that is not loaded
// yet), an account that is gone, a screen this build does not know, and a form for a reader.
export function shortcutRows(
    shortcuts: readonly Shortcut[],
    input: ShortcutRowsInput
): ShortcutRow[] {
    return shortcuts.flatMap(shortcut => rowOf(shortcut, input) ?? [])
}
