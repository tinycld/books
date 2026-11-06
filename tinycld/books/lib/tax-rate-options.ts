import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksTaxAgencies, BooksTaxRates } from '../types'
import { ratePercentText } from './sales-tax'
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
