import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksTaxAgencies, BooksTaxRates } from '../types'
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
