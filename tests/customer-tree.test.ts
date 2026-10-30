import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import {
    compareCustomerNames,
    customerListViewState,
    customerMatches,
    customerRows,
    pickerOptions,
    type TreeCustomer,
    usableParentId,
} from '../tinycld/books/lib/customer-tree'

function treeCustomer(seed: Pick<TreeCustomer, 'id' | 'display_name'> & Partial<TreeCustomer>) {
    return { company: '', email: '', phone: '', parent: '', inactive: false, ...seed }
}

// Lower-case, so a case-sensitive sort puts it after every capitalized name.
const LOWER = treeCustomer({ id: 'lower1', display_name: 'bramble cafe' })
const ORPHAN = treeCustomer({
    id: 'orphan1',
    display_name: 'Kestrel Orphan Supply',
    parent: 'no_such_parent',
})
const ROWS: TreeCustomer[] = [...CUSTOMERS, LOWER]

// The row type says company, email and phone are strings, but a row can arrive without
// them; search reads them all.
function sparseCustomer(seed: Pick<TreeCustomer, 'id' | 'display_name'>): TreeCustomer {
    const row: Partial<TreeCustomer> = { parent: '', inactive: false, ...seed }
    return row as TreeCustomer
}

function names(query: string, showInactive = false, customers: TreeCustomer[] = ROWS) {
    return customerRows(customers, { query, showInactive }).map(r => r.customer.display_name)
}

function shape(query: string, showInactive = false, customers: TreeCustomer[] = ROWS) {
    return customerRows(customers, { query, showInactive }).map(r => [
        r.customer.display_name,
        r.depth,
    ])
}

describe('compareCustomerNames', () => {
    it('ignores case', () => {
        const bluefin = treeCustomer({ id: 'b1', display_name: 'Bluefin Marine Supply' })
        const cedar = treeCustomer({ id: 'c1', display_name: 'Cedar & Pine Landscaping' })
        expect(compareCustomerNames(LOWER, bluefin)).toBeGreaterThan(0)
        expect(compareCustomerNames(LOWER, cedar)).toBeLessThan(0)
    })

    it('breaks a tie on equal names by id', () => {
        const a = treeCustomer({ id: 'a', display_name: 'Same Name' })
        const b = treeCustomer({ id: 'b', display_name: 'same name' })
        expect(compareCustomerNames(a, b)).toBeLessThan(0)
        expect(compareCustomerNames(b, a)).toBeGreaterThan(0)
    })
})

describe('customerMatches', () => {
    const northwind = ROWS.find(c => c.id === CUSTOMER_IDS.northwind)
    const cedar = ROWS.find(c => c.id === 'cust_cedar_0001')

    it('matches display name, company, email and phone, ignoring case', () => {
        if (!northwind || !cedar) throw new Error('fixture rows missing')
        expect(customerMatches(northwind, 'northwind TRADERS')).toBe(true)
        expect(customerMatches(northwind, 'traders inc')).toBe(true)
        expect(customerMatches(northwind, 'BILLING@NORTHWIND')).toBe(true)
        expect(customerMatches(northwind, '(503) 555-0110')).toBe(true)
        expect(customerMatches(cedar, 'cedar and pine')).toBe(true)
    })

    it('does not throw on a row whose company, email or phone is missing', () => {
        const sparse = sparseCustomer({ id: 'sparse1', display_name: 'Kestrel Sparse Goods' })
        expect(() => customerMatches(sparse, 'sparse')).not.toThrow()
        expect(customerMatches(sparse, 'SPARSE goods')).toBe(true)
        expect(customerMatches(sparse, 'billing@')).toBe(false)
    })

    it('does not match text in none of those fields', () => {
        if (!northwind) throw new Error('fixture row missing')
        expect(customerMatches(northwind, 'Industrial Parkway')).toBe(false)
        expect(customerMatches(northwind, 'Priya')).toBe(false)
    })
})

describe('customerRows order', () => {
    it('sorts top-level rows by display name, ignoring case', () => {
        const topLevel = customerRows(ROWS, { query: '', showInactive: false })
            .filter(r => r.depth === 0)
            .map(r => r.customer.display_name)
        expect(topLevel).toEqual([
            'Aspen Ridge Dental',
            'Bluefin Marine Supply',
            'bramble cafe',
            'Cedar & Pine Landscaping',
            'Delta Freight Partners',
            'Evergreen Montessori School',
            'Fox Hollow Vineyards',
            'Granite Peak Outfitters',
            'Harborview Hospitality Group',
            'Iris Nakamura',
            'Juniper Street Coffee',
            'Lakeshore Property Management',
            'Marisol Alvarez',
            'Northwind Traders',
            'Quarry Lane Architects',
            "Sean O'Brien",
            'St. Jude Community Hospital Foundation of the Greater Willamette Valley',
            'Wei Chen',
        ])
    })

    it('follows each parent with its sub-customers at depth 1, sorted by name', () => {
        const rows = shape('')
        const at = (name: string) => rows.findIndex(([n]) => n === name)
        const harborview = at('Harborview Hospitality Group')
        expect(rows.slice(harborview, harborview + 4)).toEqual([
            ['Harborview Hospitality Group', 0],
            ['Harborview Events', 1],
            ['Harborview Kitchen', 1],
            ['Iris Nakamura', 0],
        ])
        const northwind = at('Northwind Traders')
        expect(rows.slice(northwind, northwind + 4)).toEqual([
            ['Northwind Traders', 0],
            ['Northwind Portland store', 1],
            ['Northwind Seattle warehouse', 1],
            ['Quarry Lane Architects', 0],
        ])
        const stJude = at('St. Jude Community Hospital Foundation of the Greater Willamette Valley')
        expect(rows.slice(stJude + 1, stJude + 3)).toEqual([
            ['St. Jude Annual Spring Gala and Silent Auction Catering', 1],
            ['St. Jude West Annex renovation', 1],
        ])
    })

    it('shows a sub-customer whose parent is missing as a top-level row', () => {
        const rows = shape('', false, [...ROWS, ORPHAN])
        const at = rows.findIndex(([n]) => n === 'Kestrel Orphan Supply')
        expect(rows[at]).toEqual(['Kestrel Orphan Supply', 0])
        expect(rows[at - 1]).toEqual(['Juniper Street Coffee', 0])
        expect(rows[at + 1]).toEqual(['Lakeshore Property Management', 0])
    })
})

describe('customerRows inactive filter', () => {
    it('leaves inactive customers out unless showInactive is on', () => {
        const hidden = names('', false)
        expect(hidden).not.toContain('Old Mill Bakery')
        expect(hidden).not.toContain('Northwind Boise (closed)')

        const shown = shape('', true)
        expect(shown).toContainEqual(['Old Mill Bakery', 0])
        const boise = shown.findIndex(([n]) => n === 'Northwind Boise (closed)')
        expect(shown[boise - 1]).toEqual(['Northwind Traders', 0])
        expect(shown[boise]).toEqual(['Northwind Boise (closed)', 1])
    })

    it('an empty query keeps every row the inactive filter keeps', () => {
        const ids = (showInactive: boolean) =>
            customerRows(ROWS, { query: '', showInactive })
                .map(r => r.customer.id)
                .sort()
        const active = ROWS.filter(c => !c.inactive)
            .map(c => c.id)
            .sort()
        expect(ids(false)).toEqual(active)
        expect(ids(true)).toEqual(ROWS.map(c => c.id).sort())
    })
})

describe('customerRows search', () => {
    it('matches email, phone and company, ignoring case', () => {
        expect(shape('BILLING@NORTHWIND')).toEqual([['Northwind Traders', 0]])
        expect(shape('(503) 555-0110')).toEqual([['Northwind Traders', 0]])
        expect(shape('cedar and pine')).toEqual([['Cedar & Pine Landscaping', 0]])
    })

    it('keeps the parent of a matching sub-customer and drops its other sub-customers', () => {
        expect(shape('Seattle warehouse')).toEqual([
            ['Northwind Traders', 0],
            ['Northwind Seattle warehouse', 1],
        ])
    })

    it('a parent that matches alone shows without its non-matching sub-customers', () => {
        // Only the parent's email has this text; its sub-customers share its company name.
        expect(shape('ACCOUNTS.PAYABLE@harborview')).toEqual([['Harborview Hospitality Group', 0]])
    })

    it('keeps each matching sub-customer under its parent', () => {
        expect(shape('harborview')).toEqual([
            ['Harborview Hospitality Group', 0],
            ['Harborview Events', 1],
            ['Harborview Kitchen', 1],
        ])
    })

    it('searches past a row whose company, email or phone is missing', () => {
        const sparse = sparseCustomer({ id: 'sparse1', display_name: 'Kestrel Sparse Goods' })
        const customers = [...ROWS, sparse]
        expect(() =>
            customerRows(customers, { query: 'northwind', showInactive: false })
        ).not.toThrow()
        expect(shape('kestrel sparse', false, customers)).toEqual([['Kestrel Sparse Goods', 0]])
        expect(shape('BILLING@NORTHWIND', false, customers)).toEqual([['Northwind Traders', 0]])
    })

    it('does not find an inactive customer while inactive customers are hidden', () => {
        expect(shape('Old Mill')).toEqual([])
        expect(shape('Old Mill', true)).toEqual([['Old Mill Bakery', 0]])
    })
})

// Precedence asserted (the checkpoint lists the states in this order, and a failed query
// is not ready, so the error must win over loading): error, then loading, then empty,
// then ready, then all-inactive, else no-match.
describe('customerListViewState', () => {
    const INACTIVE = ROWS.filter(c => c.inactive)
    const viewState = (input: Partial<Parameters<typeof customerListViewState>[0]>) =>
        customerListViewState({
            isReady: true,
            isError: false,
            customers: ROWS,
            rowCount: 0,
            query: '',
            showInactive: false,
            ...input,
        })

    it('is loading until the query is ready', () => {
        expect(viewState({ isReady: false, customers: [] })).toBe('loading')
        expect(viewState({ isReady: false, rowCount: 3 })).toBe('loading')
    })

    it('is error on a failed query, before loading and before rows', () => {
        expect(viewState({ isError: true, isReady: false, customers: [] })).toBe('error')
        expect(viewState({ isError: true, rowCount: 3 })).toBe('error')
    })

    it('is empty when ready with no customers at all, whatever the search', () => {
        expect(viewState({ customers: [] })).toBe('empty')
        expect(viewState({ customers: [], query: 'harborview' })).toBe('empty')
    })

    it('is ready when there are rows', () => {
        expect(viewState({ rowCount: 1 })).toBe('ready')
        expect(viewState({ customers: INACTIVE, rowCount: 2, showInactive: true })).toBe('ready')
    })

    it('is all-inactive when the default view hides every customer', () => {
        expect(INACTIVE.length).toBeGreaterThan(0)
        expect(viewState({ customers: INACTIVE })).toBe('all-inactive')
        expect(viewState({ customers: INACTIVE, query: '   ' })).toBe('all-inactive')
    })

    it('is no-match when a search finds nothing, even if every customer is inactive', () => {
        expect(viewState({ customers: INACTIVE, query: 'Old Mill' })).toBe('no-match')
    })

    it('is no-match when some customer is active and a search finds nothing', () => {
        expect(viewState({ query: 'Zephyr Logistics' })).toBe('no-match')
    })
})

describe('pickerOptions', () => {
    const named = (id: string, display_name: string) => ({ id, display_name })
    const optionNames = (rows: { display_name: string }[]) => rows.map(r => r.display_name)

    it('matches the display name, ignoring case', () => {
        const options = pickerOptions(CUSTOMERS, { term: 'northwind', selfId: '' })
        expect(optionNames(options)).toContain('Northwind Traders')
        expect(optionNames(options)).not.toContain('Aspen Ridge Dental')
        expect(options.every(r => r.display_name.toLowerCase().includes('northwind'))).toBe(true)
    })

    it('leaves out the customer being edited', () => {
        const options = pickerOptions(CUSTOMERS, { term: '', selfId: CUSTOMER_IDS.northwind })
        expect(options.map(r => r.id)).not.toContain(CUSTOMER_IDS.northwind)
        expect(optionNames(options)).toContain('Aspen Ridge Dental')
    })

    it('treats % and _ as literal characters, not wildcards', () => {
        const rows = [
            named('p1', 'Acme 100% Juice'),
            named('u1', 'North_West Supply'),
            named('n1', 'Northwest Supply'),
            named('b1', 'Bluefin Marine Supply'),
        ]
        expect(optionNames(pickerOptions(rows, { term: '%', selfId: '' }))).toEqual([
            'Acme 100% Juice',
        ])
        expect(optionNames(pickerOptions(rows, { term: '100%', selfId: '' }))).toEqual([
            'Acme 100% Juice',
        ])
        expect(optionNames(pickerOptions(rows, { term: 'north_west', selfId: '' }))).toEqual([
            'North_West Supply',
        ])
    })

    it('keeps the first 50 of 60 matches, in the order given', () => {
        const rows = Array.from({ length: 60 }, (_, i) =>
            named(`m${i}`, `Match ${String(i).padStart(2, '0')}`)
        )
        expect(pickerOptions(rows, { term: 'match', selfId: '' })).toEqual(rows.slice(0, 50))
    })
})

describe('usableParentId', () => {
    const candidate = (seed: Partial<{ id: string; parent: string; inactive: boolean }>) => ({
        id: 'top1',
        parent: '',
        inactive: false,
        ...seed,
    })

    it('is the id of an active top-level customer', () => {
        expect(usableParentId(candidate({ id: CUSTOMER_IDS.northwind }))).toBe(
            CUSTOMER_IDS.northwind
        )
    })

    it('is empty for no customer, an inactive customer and a sub-customer', () => {
        expect(usableParentId(undefined)).toBe('')
        expect(usableParentId(candidate({ inactive: true }))).toBe('')
        expect(usableParentId(candidate({ parent: CUSTOMER_IDS.northwind }))).toBe('')
    })
})
