// What the Customize shortcuts dialog offers under "Add shortcut": every screen, form,
// Books report and account register the user can open that is not in the list yet.
import type { accountOptionList } from './account-options'
import type { ShortcutTarget } from './shortcut-catalog'
import type { ShortcutReport } from './shortcut-rows'
import { canAddShortcut, hasShortcut, type Shortcut, shortcutKey } from './sidebar-shortcuts'

// The shape of a SearchPicker option, with the shortcut the option adds. `id` is the
// shortcut's key (`<kind>:<ref>`).
export interface ShortcutChoice {
    id: string
    label: string
    group: string
    indent?: number
    shortcut: Shortcut
}

// An active account as the account pickers offer it (useAccountOptions).
export type ChoiceAccount = ReturnType<typeof accountOptionList>['options'][number]

export interface ShortcutChoicesInput {
    // staticTargets(canWrite): a reader's list has no form.
    targets: readonly ShortcutTarget[]
    reports: readonly ShortcutReport[]
    // The active accounts in chart order (useAccountOptions).
    accounts: readonly ChoiceAccount[]
}

const GROUP_OF_KIND = {
    screen: 'Screens',
    new: 'New',
    report: 'Reports',
    register: 'Registers',
} satisfies Record<Shortcut['kind'], string>

function choice(shortcut: Shortcut, label: string, indent?: number): ShortcutChoice {
    return {
        id: shortcutKey(shortcut),
        label,
        group: GROUP_OF_KIND[shortcut.kind],
        indent,
        shortcut,
    }
}

// A shipped report is kept by its shipped key, which stays the same when the report's row
// is made again; a saved report has only its row id.
export function reportShortcut(report: ShortcutReport): Shortcut {
    return { kind: 'report', ref: report.shippedKey === '' ? report.id : report.shippedKey }
}

// In the order of the groups: screens, forms, reports, registers. Empty when the list is
// full. The options of one group are consecutive, as SearchPicker needs.
export function shortcutChoices(
    list: readonly Shortcut[],
    input: ShortcutChoicesInput
): ShortcutChoice[] {
    if (!canAddShortcut(list)) return []
    const all = [
        ...input.targets
            .filter(target => target.shortcut.kind === 'screen')
            .map(target => choice(target.shortcut, target.label)),
        ...input.targets
            .filter(target => target.shortcut.kind === 'new')
            .map(target => choice(target.shortcut, target.label)),
        ...input.reports.map(report => choice(reportShortcut(report), report.title)),
        ...input.accounts.map(account =>
            choice({ kind: 'register', ref: account.value }, account.label, account.indent)
        ),
    ]
    return all.filter(candidate => !hasShortcut(list, candidate.shortcut))
}

// The choices whose label holds every word of the search, in any letter case. A search
// drops the chart's indent: a child without its parent would hang.
export function searchChoices(choices: readonly ShortcutChoice[], term: string): ShortcutChoice[] {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return [...choices]
    return choices
        .filter(candidate => {
            const label = candidate.label.toLowerCase()
            return words.every(word => label.includes(word))
        })
        .map(candidate => ({ ...candidate, indent: undefined }))
}
