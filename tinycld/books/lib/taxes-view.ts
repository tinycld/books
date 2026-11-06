import type { AgencyWithRates, GroupRow } from '../hooks/useTaxesScreen'
import { groupPpm, ratePercentText } from './sales-tax'
import { EMPTY_HINT, EMPTY_QUESTION, EMPTY_READ_ONLY, GROUPS_NEED_RATES } from './tax-messages'

// The Sales tax page as plain data: what each agency card, rate row and group row
// shows. Pure, so the page's rules (order, the default, Show inactive, the group
// lines) are unit-tested without a store.

export type TaxRowView = {
    id: string
    kind: 'rate' | 'group'
    name: string
    percent: string
    ppm: number
    isDefault: boolean
    inactive: boolean
    components: string
}

export type AgencyCardView = {
    id: string
    name: string
    accountLine: string
    inactive: boolean
    // Any rate at all, inactive included, so a card whose rates Show inactive hides
    // does not claim it has none (the server refuses to delete it).
    hasRates: boolean
    rates: TaxRowView[]
}

export type TaxesView = {
    agencies: AgencyCardView[]
    groups: TaxRowView[]
    activeRateCount: number
    defaultRow: TaxRowView | null
    showDefaultCard: boolean
    groupsHint: string | null
    isEmpty: boolean
}

export type TaxesControls = { showActions: boolean; canPressWrites: boolean; showMenus: boolean }

export type EmptyState = { title: string; hint: string | null; showAddAgency: boolean }

type RateRow = AgencyWithRates['rates'][number]
type TaxRecord = RateRow | GroupRow

interface TaxesViewInput {
    agencies: readonly AgencyWithRates[]
    groups: readonly GroupRow[]
    showInactive: boolean
    pendingDefaultId: string | null
}

// Caseless name order; two names that differ only in case keep a stable order by id.
export function compareNames(a: { name: string; id: string }, b: { name: string; id: string }) {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

function byName<T extends { name: string; id: string }>(rows: readonly T[]): T[] {
    return [...rows].sort(compareNames)
}

// Realtime can briefly show two rows flagged default while the server swaps it; the
// swap stamps the new default last, so the latest `updated` wins.
function storedDefaultId(rows: readonly TaxRecord[]): string | null {
    const flagged = rows.filter(row => row.is_default)
    const latest = [...flagged].sort((a, b) => {
        if (a.updated !== b.updated) return a.updated > b.updated ? -1 : 1
        return compareNames(a, b)
    })[0]
    return latest?.id ?? null
}

// A pending write's target is the default while it runs ('' is Remove default).
function defaultIdOf(rows: readonly TaxRecord[], pendingDefaultId: string | null) {
    if (pendingDefaultId === null) return storedDefaultId(rows)
    return pendingDefaultId === '' ? null : pendingDefaultId
}

function rateLabel(rate: RateRow) {
    return `${rate.name} ${ratePercentText(rate.rate_ppm)}`
}

// The same `<number> <name>` text the account pickers show.
function accountLine({ liability }: AgencyWithRates) {
    const account = liability ? `${liability.number} ${liability.name}` : ''
    return `Tax goes to ${account}`.trim()
}

export function buildTaxesView({
    agencies,
    groups,
    showInactive,
    pendingDefaultId,
}: TaxesViewInput): TaxesView {
    const allRates = agencies.flatMap(agency => agency.rates)
    // Every rate, inactive included, so a stored inactive component still counts.
    const rateById = new Map(allRates.map(rate => [rate.id, rate]))
    const defaultId = defaultIdOf([...allRates, ...groups], pendingDefaultId)
    const isShown = (row: { inactive: boolean }) => showInactive || !row.inactive

    const rateRow = (rate: RateRow): TaxRowView => ({
        id: rate.id,
        kind: 'rate',
        name: rate.name,
        percent: ratePercentText(rate.rate_ppm),
        ppm: rate.rate_ppm,
        isDefault: rate.id === defaultId,
        inactive: rate.inactive,
        components: '',
    })

    const groupRow = (group: GroupRow): TaxRowView => {
        const found = group.components.flatMap(id => {
            const rate = rateById.get(id)
            return rate ? [rate] : []
        })
        const ppm = groupPpm(found.map(rate => rate.rate_ppm))
        return {
            id: group.id,
            kind: 'group',
            name: group.name,
            percent: ratePercentText(ppm),
            ppm,
            isDefault: group.id === defaultId,
            inactive: group.inactive,
            components: byName(found).map(rateLabel).join(' + '),
        }
    }

    const cards = byName(agencies.filter(isShown)).map(agency => ({
        id: agency.id,
        name: agency.name,
        accountLine: accountLine(agency),
        inactive: agency.inactive,
        hasRates: agency.rates.length > 0,
        rates: byName(agency.rates.filter(isShown)).map(rateRow),
    }))
    const groupRows = byName(groups.filter(isShown)).map(groupRow)
    const allRows = [...allRates.map(rateRow), ...groups.map(groupRow)]
    const activeRateCount = allRates.filter(rate => !rate.inactive).length

    return {
        agencies: cards,
        groups: groupRows,
        activeRateCount,
        defaultRow: allRows.find(row => row.isDefault) ?? null,
        showDefaultCard: activeRateCount > 0,
        groupsHint: activeRateCount < 2 ? GROUPS_NEED_RATES : null,
        isEmpty: agencies.length === 0,
    }
}

export function taxesControls(canWrite: boolean, writesAvailable: boolean): TaxesControls {
    return {
        showActions: canWrite,
        canPressWrites: canWrite && writesAvailable,
        showMenus: canWrite,
    }
}

// A group needs two active rates, so Add group waits for a second one.
export function addGroupEnabled(controls: TaxesControls, view: TaxesView): boolean {
    return controls.canPressWrites && view.activeRateCount >= 2
}

export function emptyState(canWrite: boolean): EmptyState {
    if (canWrite) return { title: EMPTY_QUESTION, hint: EMPTY_HINT, showAddAgency: true }
    return { title: EMPTY_READ_ONLY, hint: null, showAddAgency: false }
}
