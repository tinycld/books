import type { SelectOption } from '@tinycld/core/ui/form'
import type { AgencyWithRates, GroupRow } from '../hooks/useTaxesScreen'
import type { BooksTaxAgencies, BooksTaxRates } from '../types'
import { groupPpm, ratePercentText } from './sales-tax'
import { compareNames } from './taxes-view'

export type TaxOptionRate = Pick<
    BooksTaxRates,
    'id' | 'name' | 'type' | 'rate_ppm' | 'agency' | 'components' | 'inactive'
>

export type TaxOptionAgency = Pick<BooksTaxAgencies, 'id' | 'name' | 'inactive'>

// The rate dialog's agencies: the active ones in name order. An edited rate's agency
// that has since become inactive stays listed, in its name place, so the select still
// shows it and a save keeps it.
export function rateAgencyOptions(
    agencies: readonly TaxOptionAgency[],
    storedId: string
): SelectOption[] {
    const listed = agencies.filter(agency => !agency.inactive || agency.id === storedId)
    return [...listed].sort(compareNames).map(agency => ({
        value: agency.id,
        label: agency.inactive ? `${agency.name} (inactive)` : agency.name,
    }))
}

// The group dialog's checklist: the active rates, agency by agency (agencies in name
// order), each agency's rates in name order. A rate the edited group stores that has
// since become inactive stays listed in its place, so the checklist still shows it
// checked and a save keeps it. Until the agencies load, a rate has no agency text.
export function groupComponentOptions(
    rates: readonly TaxOptionRate[],
    agencies: readonly TaxOptionAgency[],
    storedIds: readonly string[]
): SelectOption[] {
    const agencyById = new Map(agencies.map(agency => [agency.id, agency]))
    const agencyOf = (rate: TaxOptionRate) =>
        agencyById.get(rate.agency) ?? { id: rate.agency, name: '' }
    const stored = new Set(storedIds)
    const listed = rates.filter(
        rate => rate.type === 'rate' && (!rate.inactive || stored.has(rate.id))
    )
    const ordered = [...listed].sort(
        (a, b) => compareNames(agencyOf(a), agencyOf(b)) || compareNames(a, b)
    )
    return ordered.map(rate => {
        const agencyName = agencyOf(rate).name
        const agencyText = agencyName ? ` · ${agencyName}` : ''
        const label = `${rate.name} ${ratePercentText(rate.rate_ppm)}${agencyText}`
        return { value: rate.id, label: rate.inactive ? `${label} (inactive)` : label }
    })
}

function optionColumns(row: TaxOptionRate): TaxOptionRate {
    const { id, name, type, rate_ppm, agency, components, inactive } = row
    return { id, name, type, rate_ppm, agency, components, inactive }
}

// The page's two queries as one list for the pickers: every agency's rates (inactive
// ones included, so a stored inactive choice can still be shown), then every group.
export function taxOptionRows(
    agencies: readonly AgencyWithRates[],
    groups: readonly GroupRow[]
): TaxOptionRate[] {
    const rates = agencies.flatMap(agency => agency.rates)
    return [...rates, ...groups].map(optionColumns)
}

const GROUPS_SECTION = 'Groups'

function inactiveLabel(row: TaxOptionRate, label: string) {
    return row.inactive ? `${label} (inactive)` : label
}

// "None" first, then the active rates under their agency's heading (agencies, then
// each agency's rates, in name order), then the active groups under "Groups". A
// stored choice that has since become inactive stays listed in its place, marked
// inactive, so the picker still shows it.
export function taxRateOptions(
    rows: readonly TaxOptionRate[],
    agencies: readonly TaxOptionAgency[],
    storedId: string
): SelectOption[] {
    const listed = rows.filter(row => !row.inactive || row.id === storedId)
    const agencyById = new Map(agencies.map(agency => [agency.id, agency]))
    const agencyOf = (rate: TaxOptionRate) =>
        agencyById.get(rate.agency) ?? { id: rate.agency, name: '' }
    const ppmById = new Map(rows.map(row => [row.id, row.rate_ppm]))

    const rates = listed
        .filter(row => row.type === 'rate')
        .sort((a, b) => compareNames(agencyOf(a), agencyOf(b)) || compareNames(a, b))
        .map(rate => ({
            value: rate.id,
            label: inactiveLabel(rate, `${rate.name} ${ratePercentText(rate.rate_ppm)}`),
            section: agencyOf(rate).name || undefined,
        }))

    const groups = listed
        .filter(row => row.type === 'group')
        .sort(compareNames)
        .map(group => {
            const ppms = group.components.flatMap(id => {
                const ppm = ppmById.get(id)
                return ppm === undefined ? [] : [ppm]
            })
            const label = `${group.name} ${ratePercentText(groupPpm(ppms))}`
            return { value: group.id, label: inactiveLabel(group, label), section: GROUPS_SECTION }
        })

    return [{ value: '', label: 'None' }, ...rates, ...groups]
}
