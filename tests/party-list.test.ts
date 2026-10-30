import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import {
    companyLine,
    emptyKindFor,
    listWriteControls,
    PARTY_ROW_HEIGHT,
    PARTY_TABLE_MIN_WIDTH,
    type PartyListViewState,
    partyCardHeight,
    partyListViewState,
    partyRows,
    showsToolbar,
} from '../tinycld/books/lib/party-list'

type Row = (typeof CUSTOMERS)[number]

const BASE = CUSTOMERS[0]

function row(seed: Pick<Row, 'id' | 'display_name'> & Partial<Row>): Row {
    return { ...BASE, company: '', email: '', phone: '', inactive: false, parent: '', ...seed }
}

// Lower-case, so a case-sensitive sort puts it after every capitalized name.
const LOWER: Row = {
    ...CUSTOMERS[0],
    id: 'lower00000001',
    display_name: 'acme cleaning',
    company: '',
    email: '',
    phone: '',
    inactive: false,
    parent: '',
}

// Each searchable value appears on no other row.
const KESTREL = row({
    id: 'kestrel000001',
    display_name: 'Kestrel Goods',
    company: 'Kestrel Holdings LLC',
    email: 'ap@kestrel.example',
    phone: '(541) 555-0177',
})

const ROWS: Row[] = [...CUSTOMERS, LOWER]
const ALL_STATES: PartyListViewState[] = [
    'loading',
    'error',
    'empty',
    'no-match',
    'all-inactive',
    'ready',
]

function names(records: readonly Row[], query = '', showInactive = false) {
    return partyRows(records, { query, showInactive }).map(r => r.party.display_name)
}

function ids(records: readonly Row[], query = '', showInactive = false) {
    return partyRows(records, { query, showInactive }).map(r => r.party.id)
}

// The row type says company is a string, but a row can arrive without it.
function withoutCompany(source: Row): Row {
    const { company: _company, ...rest } = source
    return rest as Row
}

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

describe('table sizes', () => {
    it('has a 540 px minimum table width and 56 px rows', () => {
        expect(PARTY_TABLE_MIN_WIDTH).toBe(540)
        expect(PARTY_ROW_HEIGHT).toBe(56)
    })
})

describe('partyRows', () => {
    it('sorts by display name ignoring case, every row at depth 0 with no nesting', () => {
        const rows = partyRows(ROWS, { query: '', showInactive: false })
        expect(rows.every(r => r.depth === 0)).toBe(true)
        // Sub-customers sort among the others by their own names, not under their parent.
        expect(rows.map(r => r.party.display_name)).toEqual([
            'acme cleaning',
            'Alvarez kitchen remodel',
            'Aspen Ridge Dental',
            'Bluefin Marine Supply',
            'Cedar & Pine Landscaping',
            'Delta Freight Partners',
            'Evergreen Montessori School',
            'Fox Hollow Vineyards',
            'Granite Peak Outfitters',
            'Harborview Events',
            'Harborview Hospitality Group',
            'Harborview Kitchen',
            'Iris Nakamura',
            'Juniper Street Coffee',
            'Lakeshore Property Management',
            'Marisol Alvarez',
            'Northwind Portland store',
            'Northwind Seattle warehouse',
            'Northwind Traders',
            'Quarry Lane Architects',
            "Sean O'Brien",
            'St. Jude Annual Spring Gala and Silent Auction Catering',
            'St. Jude Community Hospital Foundation of the Greater Willamette Valley',
            'St. Jude West Annex renovation',
            'Wei Chen',
        ])
    })

    it('puts acme cleaning before Aspen Ridge Dental', () => {
        const order = names(ROWS)
        expect(order.indexOf('acme cleaning')).toBeLessThan(order.indexOf('Aspen Ridge Dental'))
    })

    it('breaks a tie on equal names by id', () => {
        const later = row({ id: 'tie0000000002', display_name: 'Same Name' })
        const earlier = row({ id: 'tie0000000001', display_name: 'same name' })
        expect(ids([later, earlier])).toEqual(['tie0000000001', 'tie0000000002'])
        expect(ids([earlier, later])).toEqual(['tie0000000001', 'tie0000000002'])
    })

    it('drops inactive rows unless showInactive is on', () => {
        const hidden = names(ROWS)
        expect(hidden).not.toContain('Old Mill Bakery')
        expect(hidden).not.toContain('Northwind Boise (closed)')

        const shown = partyRows(ROWS, { query: '', showInactive: true })
        const shownNames = shown.map(r => r.party.display_name)
        expect(shownNames).toContain('Old Mill Bakery')
        expect(shown.find(r => r.party.id === CUSTOMER_IDS.northwindBoise)?.depth).toBe(0)
        const boise = shownNames.indexOf('Northwind Boise (closed)')
        expect(shownNames.slice(boise - 1, boise + 2)).toEqual([
            'Marisol Alvarez',
            'Northwind Boise (closed)',
            'Northwind Portland store',
        ])
        expect(ids(ROWS, 'Old Mill')).toEqual([])
        expect(ids(ROWS, 'Old Mill', true)).toEqual([CUSTOMER_IDS.oldMill])
    })

    it('matches display name, company, email and phone, ignoring case', () => {
        const records = [...ROWS, KESTREL]
        expect(ids(records, 'kestrel GOODS')).toEqual(['kestrel000001'])
        expect(ids(records, 'HOLDINGS llc')).toEqual(['kestrel000001'])
        expect(ids(records, 'AP@KESTREL')).toEqual(['kestrel000001'])
        expect(ids(records, '(541) 555-0177')).toEqual(['kestrel000001'])
    })

    it('does not match text in no searched field', () => {
        // Harborview's notes and Northwind's first name hold these.
        expect(ids(ROWS, 'AP inbox')).toEqual([])
        expect(ids(ROWS, 'Priya')).toEqual([])
    })

    it('shows a matching sub-customer alone, without its parent', () => {
        const seattle = ROWS.find(r => r.id === CUSTOMER_IDS.northwindSeattle)
        expect(seattle?.parent).toBe(CUSTOMER_IDS.northwind)
        const rows = partyRows(ROWS, { query: 'Seattle warehouse', showInactive: false })
        expect(rows).toEqual([{ party: seattle, depth: 0 }])
    })

    it('does not throw on a row whose company is missing at run time', () => {
        const sparse = withoutCompany(row({ id: 'sparse0000001', display_name: 'Sparse Goods' }))
        const records = [...ROWS, sparse]
        expect(() => partyRows(records, { query: 'northwind', showInactive: false })).not.toThrow()
        expect(ids(records, 'SPARSE goods')).toEqual(['sparse0000001'])
        expect(ids(records, 'Northwind Traders Inc')).toEqual([
            CUSTOMER_IDS.northwindPortland,
            CUSTOMER_IDS.northwindSeattle,
            CUSTOMER_IDS.northwind,
        ])
    })
})

// Precedence: error, then loading, then empty, then ready, then all-inactive, else no-match.
describe('partyListViewState', () => {
    const INACTIVE = ROWS.filter(r => r.inactive)
    const viewState = (input: Partial<Parameters<typeof partyListViewState>[0]>) =>
        partyListViewState({
            isReady: true,
            isError: false,
            records: ROWS,
            rowCount: 0,
            query: '',
            showInactive: false,
            ...input,
        })

    it('is loading before the query is ready', () => {
        expect(viewState({ isReady: false, records: [] })).toBe('loading')
        expect(viewState({ isReady: false, rowCount: 3 })).toBe('loading')
    })

    it('is error on a failed query', () => {
        expect(viewState({ isError: true, isReady: false, records: [] })).toBe('error')
        expect(viewState({ isError: true, rowCount: 3 })).toBe('error')
    })

    it('is empty with no records', () => {
        expect(viewState({ records: [] })).toBe('empty')
        expect(viewState({ records: [], query: 'harborview' })).toBe('empty')
    })

    it('is ready with rows', () => {
        expect(viewState({ rowCount: 1 })).toBe('ready')
        expect(viewState({ records: INACTIVE, rowCount: 2, showInactive: true })).toBe('ready')
    })

    it('is all-inactive when every record is inactive, with no query and Show inactive off', () => {
        expect(INACTIVE.length).toBeGreaterThan(0)
        expect(viewState({ records: INACTIVE })).toBe('all-inactive')
        expect(viewState({ records: INACTIVE, query: '   ' })).toBe('all-inactive')
    })

    it('is no-match when a query leaves none, also when every record is inactive', () => {
        expect(viewState({ query: 'Zephyr Logistics' })).toBe('no-match')
        expect(viewState({ records: INACTIVE, query: 'Old Mill' })).toBe('no-match')
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
