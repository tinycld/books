import type { DocumentPartyKey } from './sales-document-kinds'

export type PartyTab = 'transactions' | 'contacts' | 'details' | 'notes'

// One party record: which party, and its id.
export type PartyRef = { party: DocumentPartyKey; id: string }

export type PartyTabEntry = { key: PartyTab; label: string; keys: string }

// Every tab of a party page, with its fixed key. A party shows the tabs of its own order,
// and a tab keeps its key whatever the order shows.
export const PARTY_TABS: readonly PartyTabEntry[] = [
    { key: 'transactions', label: 'Transactions', keys: 'Alt+1' },
    { key: 'contacts', label: 'Contacts', keys: 'Alt+2' },
    { key: 'details', label: 'Details', keys: 'Alt+3' },
    { key: 'notes', label: 'Notes', keys: 'Alt+4' },
]

// The tabs the strip draws, in the order given.
export function shownPartyTabs(order: readonly PartyTab[]): PartyTabEntry[] {
    return order.flatMap(key => PARTY_TABS.filter(tab => tab.key === key))
}

// The `tab` search param: a missing value, or one the order does not hold, selects the
// order's first tab.
export function partyTabOf(order: readonly PartyTab[], param: string | undefined): PartyTab {
    const shown = order.find(key => key === param)
    return shown ?? order[0] ?? 'transactions'
}
