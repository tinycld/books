import { describe, expect, it } from 'vitest'
import {
    PARTY_TABS,
    type PartyTab,
    partyTabOf,
    shownPartyTabs,
} from '../tinycld/books/lib/party-page-tabs'

// The party page's tabs (vendor-pages spec §2, §3.4): a tab keeps its ⌥ key whatever
// order the party shows, and an unknown or absent param selects the first shown tab.

const NO_TRANSACTIONS: readonly PartyTab[] = ['contacts', 'details', 'notes']

describe('PARTY_TABS', () => {
    it('gives each tab its label and ⌥ key', () => {
        expect(PARTY_TABS).toEqual([
            { key: 'transactions', label: 'Transactions', keys: 'Alt+1' },
            { key: 'contacts', label: 'Contacts', keys: 'Alt+2' },
            { key: 'details', label: 'Details', keys: 'Alt+3' },
            { key: 'notes', label: 'Notes', keys: 'Alt+4' },
        ])
    })
})

describe('partyTabOf', () => {
    it('selects the first tab of the order when there is no param', () => {
        expect(partyTabOf(NO_TRANSACTIONS, undefined)).toBe('contacts')
    })

    it('selects the first tab of the order when the param names a tab the order leaves out', () => {
        expect(partyTabOf(NO_TRANSACTIONS, 'transactions')).toBe('contacts')
        expect(partyTabOf(['notes', 'details'], 'contacts')).toBe('notes')
    })

    it('selects the first tab of the order for an unknown value', () => {
        expect(partyTabOf(NO_TRANSACTIONS, 'statements')).toBe('contacts')
        expect(partyTabOf(['transactions', 'contacts'], '')).toBe('transactions')
    })

    it('selects the param when the order holds it', () => {
        expect(partyTabOf(NO_TRANSACTIONS, 'notes')).toBe('notes')
        expect(partyTabOf(['transactions', 'contacts', 'details', 'notes'], 'details')).toBe(
            'details'
        )
    })
})

describe('shownPartyTabs', () => {
    it('keeps the order it is given and each tab its own ⌥ key', () => {
        expect(shownPartyTabs(['contacts', 'notes'])).toEqual([
            { key: 'contacts', label: 'Contacts', keys: 'Alt+2' },
            { key: 'notes', label: 'Notes', keys: 'Alt+4' },
        ])
    })

    it('follows the given order, not the PARTY_TABS order', () => {
        expect(shownPartyTabs(['notes', 'transactions']).map(tab => tab.key)).toEqual([
            'notes',
            'transactions',
        ])
        expect(shownPartyTabs(['notes', 'transactions']).map(tab => tab.keys)).toEqual([
            'Alt+4',
            'Alt+1',
        ])
    })
})
