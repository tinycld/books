import { describe, expect, it } from 'vitest'
import {
    linePartyOptions,
    parsePartyOptionId,
    partyOptionId,
} from '../tinycld/books/lib/line-party-options'

const customers = [
    { id: 'c2', display_name: 'Northwind Traders' },
    { id: 'c1', display_name: 'Apex Retail' },
    { id: 'c3', display_name: 'Zenith Foods' },
]

const vendors = [
    { id: 'v2', display_name: 'Summit IT Services' },
    { id: 'v1', display_name: 'Bright Paper Co' },
]

describe('linePartyOptions', () => {
    it('lists customers under "Customers", then vendors under "Vendors", each by display name', () => {
        expect(linePartyOptions({ customers, vendors, term: '' })).toEqual([
            { id: 'customer:c1', label: 'Apex Retail', group: 'Customers' },
            { id: 'customer:c2', label: 'Northwind Traders', group: 'Customers' },
            { id: 'customer:c3', label: 'Zenith Foods', group: 'Customers' },
            { id: 'vendor:v1', label: 'Bright Paper Co', group: 'Vendors' },
            { id: 'vendor:v2', label: 'Summit IT Services', group: 'Vendors' },
        ])
    })

    it('keeps only names that contain the term, ignoring case, in both groups', () => {
        const parties = {
            customers: [...customers, { id: 'c4', display_name: 'Seaside Traders' }],
            vendors: [...vendors, { id: 'v3', display_name: 'TRADERS Supply' }],
        }
        expect(linePartyOptions({ ...parties, term: 'tRaDeRs' })).toEqual([
            { id: 'customer:c2', label: 'Northwind Traders', group: 'Customers' },
            { id: 'customer:c4', label: 'Seaside Traders', group: 'Customers' },
            { id: 'vendor:v3', label: 'TRADERS Supply', group: 'Vendors' },
        ])
    })

    it('gives no options when a term matches nothing', () => {
        expect(linePartyOptions({ customers, vendors, term: 'nothing like it' })).toEqual([])
    })

    it('gives no options when there are no customers and no vendors', () => {
        expect(linePartyOptions({ customers: [], vendors: [], term: '' })).toEqual([])
    })

    // A stored customer or vendor that became inactive since is not among the active rows
    // the picker reads; the line that stored it keeps it as an option, once, in its group
    // (bank deposit Do step 2).
    it('keeps a stored inactive customer once, in its group by name', () => {
        const options = linePartyOptions({
            customers,
            vendors,
            term: '',
            stored: { customer: 'c9', vendor: '', display_name: 'Old Harbor Cafe' },
        })
        expect(options.filter(option => option.id === 'customer:c9')).toEqual([
            { id: 'customer:c9', label: 'Old Harbor Cafe', group: 'Customers' },
        ])
        expect(options.map(option => option.id)).toEqual([
            'customer:c1',
            'customer:c2',
            'customer:c9',
            'customer:c3',
            'vendor:v1',
            'vendor:v2',
        ])
    })

    it('keeps a stored inactive vendor once, in its group', () => {
        const options = linePartyOptions({
            customers,
            vendors,
            term: '',
            stored: { customer: '', vendor: 'v9', display_name: 'Closed Vendor LLC' },
        })
        expect(options.filter(option => option.id === 'vendor:v9')).toEqual([
            { id: 'vendor:v9', label: 'Closed Vendor LLC', group: 'Vendors' },
        ])
    })

    it('lists a stored party that is still active once, not twice', () => {
        const options = linePartyOptions({
            customers,
            vendors,
            term: '',
            stored: { customer: 'c2', vendor: '', display_name: 'Northwind Traders' },
        })
        expect(options.filter(option => option.id === 'customer:c2')).toHaveLength(1)
        expect(options).toHaveLength(customers.length + vendors.length)
    })

    it('adds nothing for a line that stored no party', () => {
        expect(
            linePartyOptions({
                customers,
                vendors,
                term: '',
                stored: { customer: '', vendor: '', display_name: '' },
            })
        ).toEqual(linePartyOptions({ customers, vendors, term: '' }))
    })
})

// The value map PartyPicker uses: a line's { customer, vendor } to an option id and back.
describe('partyOptionId and parsePartyOptionId', () => {
    it('round-trips a customer', () => {
        const id = partyOptionId({ customer: 'c1', vendor: '' })
        expect(id).toBe('customer:c1')
        expect(parsePartyOptionId(id)).toEqual({ kind: 'customer', id: 'c1' })
    })

    it('round-trips a vendor', () => {
        const id = partyOptionId({ customer: '', vendor: 'v2' })
        expect(id).toBe('vendor:v2')
        expect(parsePartyOptionId(id)).toEqual({ kind: 'vendor', id: 'v2' })
    })

    it('round-trips none: no option id, and no party for it', () => {
        const id = partyOptionId({ customer: '', vendor: '' })
        expect(id).toBe('')
        expect(parsePartyOptionId(id)).toBeNull()
    })

    it('reads no party from an id of another kind', () => {
        expect(parsePartyOptionId('account:a1')).toBeNull()
        expect(parsePartyOptionId('customer:')).toBeNull()
    })
})
