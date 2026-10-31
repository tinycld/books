import { describe, expect, it } from 'vitest'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import {
    companyLine,
    emptyKindFor,
    listWriteControls,
    PARTY_ROW_HEIGHT,
    PARTY_TABLE_MIN_WIDTH,
    type PartyListViewState,
    partyCardHeight,
    partyTitle,
    recordCardHeight,
    showsToolbar,
} from '../tinycld/books/lib/party-list'

type Row = (typeof CUSTOMERS)[number]

const BASE = CUSTOMERS[0]

function row(seed: Pick<Row, 'id' | 'display_name'> & Partial<Row>): Row {
    return { ...BASE, company: '', email: '', phone: '', inactive: false, parent: '', ...seed }
}

// Each searchable value appears on no other row.
const KESTREL = row({
    id: 'kestrel000001',
    display_name: 'Kestrel Goods',
    company: 'Kestrel Holdings LLC',
    email: 'ap@kestrel.example',
    phone: '(541) 555-0177',
})

const ALL_STATES: PartyListViewState[] = [
    'loading',
    'error',
    'empty',
    'no-match',
    'all-inactive',
    'ready',
]

describe('companyLine', () => {
    it('is the company when it differs from the display name', () => {
        expect(companyLine({ display_name: 'A', company: 'B' })).toBe('B')
    })

    it('is empty when the company equals the display name or is empty', () => {
        expect(companyLine({ display_name: 'A', company: 'A' })).toBe('')
        expect(companyLine({ display_name: 'A', company: '' })).toBe('')
    })
})

describe('partyCardHeight', () => {
    const nameOnly = row({ id: 'card000000001', display_name: 'Kestrel Goods' })

    it('is 44 px for a name-only row at font scale 1', () => {
        expect(partyCardHeight(nameOnly)).toBe(44)
        expect(partyCardHeight(nameOnly, 1)).toBe(44)
    })

    it('grows by 16 px for each of company line, email and phone that is not empty', () => {
        expect(partyCardHeight({ ...nameOnly, company: 'Kestrel Holdings LLC' })).toBe(60)
        expect(partyCardHeight({ ...nameOnly, email: 'ap@kestrel.example' })).toBe(60)
        expect(partyCardHeight({ ...nameOnly, phone: '(541) 555-0177' })).toBe(60)
        expect(
            partyCardHeight({
                ...nameOnly,
                company: 'Kestrel Holdings LLC',
                email: 'ap@kestrel.example',
            })
        ).toBe(76)
        expect(partyCardHeight(KESTREL)).toBe(92)
    })

    it('adds no line for a company equal to the display name', () => {
        expect(partyCardHeight({ ...nameOnly, company: 'Kestrel Goods' })).toBe(44)
    })

    it('doubles the text part at font scale 2 and keeps the 24 px padding', () => {
        const emailOnly = { ...nameOnly, email: 'ap@kestrel.example' }
        expect(partyCardHeight(emailOnly, 2)).toBe(24 + (20 + 16) * 2)
        expect(partyCardHeight(nameOnly, 2)).toBe(24 + 20 * 2)
    })
})

describe('recordCardHeight', () => {
    it('is 44 px for a card with no line under the name', () => {
        expect(recordCardHeight([])).toBe(44)
    })

    it('counts only the lines that are not empty or missing', () => {
        expect(recordCardHeight(['a', '', undefined, 'b'])).toBe(76)
    })

    it('scales the text part with the font scale and keeps the 24 px padding', () => {
        expect(recordCardHeight(['a'], 2)).toBe(96)
    })

    it('gives every fixture customer the same height as partyCardHeight', () => {
        for (const customer of CUSTOMERS) {
            const lines = [companyLine(customer), customer.email, customer.phone]
            expect(partyCardHeight(customer)).toBe(recordCardHeight(lines))
            expect(partyCardHeight(customer, 1.5)).toBe(recordCardHeight(lines, 1.5))
        }
    })
})

describe('partyTitle', () => {
    it('is the display name', () => {
        expect(partyTitle({ display_name: 'Acme' })).toBe('Acme')
    })
})

describe('table sizes', () => {
    it('has a 540 px minimum table width and 56 px rows', () => {
        expect(PARTY_TABLE_MIN_WIDTH).toBe(540)
        expect(PARTY_ROW_HEIGHT).toBe(56)
    })
})

describe('emptyKindFor', () => {
    it('maps empty, no-match and all-inactive to their empty states and the rest to null', () => {
        const kinds = ALL_STATES.map(state => [state, emptyKindFor(state)])
        expect(kinds).toEqual([
            ['loading', null],
            ['error', null],
            ['empty', 'none'],
            ['no-match', 'no-match'],
            ['all-inactive', 'all-inactive'],
            ['ready', null],
        ])
    })
})

describe('showsToolbar', () => {
    it('is true for exactly ready, no-match and all-inactive', () => {
        expect(ALL_STATES.filter(showsToolbar)).toEqual(['no-match', 'all-inactive', 'ready'])
    })
})

describe('listWriteControls', () => {
    it('shows both New buttons to a writer and neither to a read-only user', () => {
        expect(listWriteControls(true)).toEqual({ showNewButton: true, showEmptyNew: true })
        expect(listWriteControls(false)).toEqual({ showNewButton: false, showEmptyNew: false })
    })
})
