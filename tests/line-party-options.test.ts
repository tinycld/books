import { describe, expect, it } from 'vitest'
import { linePartyOptions } from '../tinycld/books/lib/line-party-options'

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
})
