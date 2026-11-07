import type { SearchPickerOption } from '../components/SearchPicker'

// The Name of a journal line: one customer or one vendor, never both.

type Party = { id: string; display_name: string }

export type LinePartyKind = 'customer' | 'vendor'

const GROUPS: Record<LinePartyKind, string> = { customer: 'Customers', vendor: 'Vendors' }

function groupOptions(kind: LinePartyKind, parties: readonly Party[], term: string) {
    const needle = term.trim().toLowerCase()
    return parties
        .filter(party => needle === '' || party.display_name.toLowerCase().includes(needle))
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map(party => ({
            id: `${kind}:${party.id}`,
            label: party.display_name,
            group: GROUPS[kind],
        }))
}

/**
 * The Name picker's options: customers under "Customers", then vendors under "Vendors",
 * each by display name, kept when the name contains the search term (any case). An
 * option id is `customer:<id>` or `vendor:<id>`.
 */
export function linePartyOptions(input: {
    customers: readonly Party[]
    vendors: readonly Party[]
    term: string
}): SearchPickerOption[] {
    return [
        ...groupOptions('customer', input.customers, input.term),
        ...groupOptions('vendor', input.vendors, input.term),
    ]
}

// The kind and record id of a Name option id; null for any other id.
export function parsePartyOptionId(optionId: string): { kind: LinePartyKind; id: string } | null {
    const [kind, id] = optionId.split(':')
    if ((kind === 'customer' || kind === 'vendor') && id) return { kind, id }
    return null
}

// The option id of a line's chosen party, '' when it names none.
export function partyOptionId(line: { customer: string; vendor: string }): string {
    if (line.customer !== '') return `customer:${line.customer}`
    if (line.vendor !== '') return `vendor:${line.vendor}`
    return ''
}

// A line's customer or vendor row, as a query materializes it.
export type LinePartyRow = { display_name: string }

// The display name of a line's customer or vendor, '' when it names none (or the row is
// not loaded).
export function linePartyName(line: {
    customerRow?: LinePartyRow
    vendorRow?: LinePartyRow
}): string {
    return line.customerRow?.display_name ?? line.vendorRow?.display_name ?? ''
}
