import { z } from '@tinycld/core/ui/form'
import type { AccountChoice } from '../hooks/useAccountOptions'
import type { AccountGroup } from './account-types'
import type { FilterChoiceOption, FilterSpec } from './report-definition'

// A filter picker's draft. An empty selection is not a filter, so Apply waits for one value.
export const filterPickerSchema = z.object({ values: z.array(z.string()).min(1) })

const GROUP_PREFIX = 'group:'

const ACCOUNT_GROUPS: readonly AccountGroup[] = [
    'asset',
    'liability',
    'equity',
    'income',
    'expense',
]

// An accounts filter value is an account id or one of these group choices.
export const ACCOUNT_GROUP_CHOICES: readonly FilterChoiceOption[] = ACCOUNT_GROUPS.map(group => ({
    id: `${GROUP_PREFIX}${group}`,
    label: `All ${group} accounts`,
}))

export function accountGroupOf(value: string): AccountGroup | null {
    if (!value.startsWith(GROUP_PREFIX)) return null
    const name = value.slice(GROUP_PREFIX.length)
    return ACCOUNT_GROUPS.find(group => group === name) ?? null
}

// A `group:` value must name a real group; any other value is an account id.
function isAccountsValue(value: string): boolean {
    if (value === '') return false
    return !value.startsWith(GROUP_PREFIX) || accountGroupOf(value) !== null
}

function filterValues(spec: FilterSpec, items: readonly string[]): string[] {
    if (spec.kind === 'choice') {
        return spec.options.map(option => option.id).filter(id => items.includes(id))
    }
    return [...new Set(items.filter(isAccountsValue))]
}

// The URL and the form both pass through here, so the same state gives the same filters:
// only declared filters, valid values, no repeats, choice values in spec order, no empty filter.
export function normalizeFilters(
    specs: readonly FilterSpec[],
    filters: Readonly<Record<string, readonly string[] | undefined>>
): Record<string, string[]> {
    const normalized: Record<string, string[]> = {}
    for (const spec of specs) {
        const values = filterValues(spec, filters[spec.id] ?? [])
        if (values.length > 0) normalized[spec.id] = values
    }
    return normalized
}

function groupLabel(value: string): string | undefined {
    return ACCOUNT_GROUP_CHOICES.find(choice => choice.id === value)?.label
}

// Group labels and account names belong to an accounts filter only, so a choice value that
// happens to match an account id or a group still reads as a choice.
// `names` holds every account, inactive ones too, so a link to an old account still reads.
function singleValueLabel(
    spec: FilterSpec,
    value: string,
    names: ReadonlyMap<string, string>
): string {
    if (spec.kind === 'choice') {
        return spec.options.find(option => option.id === value)?.label ?? '1 selection'
    }
    return groupLabel(value) ?? names.get(value) ?? '1 account'
}

export function filterChipValue(
    spec: FilterSpec,
    values: readonly string[],
    names: ReadonlyMap<string, string>
): string {
    if (values.length === 1) return singleValueLabel(spec, values[0], names)
    const onlyAccounts =
        spec.kind === 'accounts' && values.every(value => accountGroupOf(value) === null)
    return onlyAccounts ? `${values.length} accounts` : `${values.length} selections`
}

// The account rows of a picker: the active accounts, then each selected account that is not
// among them (made inactive after the filter was applied, or a linked id), so it can still be
// unchecked. A selected id with no name has nothing to show and gets no row.
export function pickerRows(
    choices: readonly AccountChoice[],
    selected: readonly string[],
    names: ReadonlyMap<string, string>
): AccountChoice[] {
    const offered = new Set(choices.map(choice => choice.value))
    const extra: AccountChoice[] = []
    for (const value of new Set(selected)) {
        const label = names.get(value)
        if (offered.has(value) || value.startsWith(GROUP_PREFIX) || label === undefined) continue
        extra.push({ value, label })
    }
    return [...choices, ...extra]
}

// An accounts filter keeps the groups and the accounts its picker shows a row for, so it never
// holds a value the user cannot see or uncheck. Until the account names are known, every id is
// nameless, so it keeps all of them rather than drop live accounts.
export function shownAccountValues(
    values: readonly string[],
    rows: readonly AccountChoice[],
    accountsKnown: boolean
): string[] {
    if (!accountsKnown) return [...values]
    const shown = new Set(rows.map(row => row.value))
    return values.filter(value => accountGroupOf(value) !== null || shown.has(value))
}

export function hasActiveFilters(filters: Record<string, string[]>): boolean {
    return Object.values(filters).some(values => values.length > 0)
}

export function withoutFilter(
    filters: Record<string, string[]>,
    filterId: string
): Record<string, string[]> {
    return Object.fromEntries(Object.entries(filters).filter(([id]) => id !== filterId))
}

export function inactiveFilters(
    specs: readonly FilterSpec[],
    filters: Record<string, string[]>
): FilterSpec[] {
    return specs.filter(spec => !filters[spec.id]?.length)
}
