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

// The party a line stored when its picker mounted, with its display name ('' while its
// row loads).
export type StoredLineParty = { customer: string; vendor: string; display_name: string }

// The parties of one group with the stored party of that group added once, when the
// active rows do not list it (it became inactive since) and its name is known.
function withStored(
    kind: LinePartyKind,
    parties: readonly Party[],
    stored: StoredLineParty | undefined
): readonly Party[] {
    const id = kind === 'customer' ? stored?.customer : stored?.vendor
    if (!stored || !id || stored.display_name === '') return parties
    if (parties.some(party => party.id === id)) return parties
    return [...parties, { id, display_name: stored.display_name }]
}

/**
 * The Name picker's options: customers under "Customers", then vendors under "Vendors",
 * each by display name, kept when the name contains the search term (any case). An
 * option id is `customer:<id>` or `vendor:<id>`. `stored`, the party the line held when
 * its picker mounted, is listed once in its group even when it is no longer active.
 */
export function linePartyOptions(input: {
    customers: readonly Party[]
    vendors: readonly Party[]
    term: string
    stored?: StoredLineParty
}): SearchPickerOption[] {
    return [
        ...groupOptions(
            'customer',
            withStored('customer', input.customers, input.stored),
            input.term
        ),
        ...groupOptions('vendor', withStored('vendor', input.vendors, input.stored), input.term),
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
