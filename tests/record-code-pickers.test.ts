import { describe, expect, it } from 'vitest'
import { pickerOptions } from '~/tinycld/books/lib/customer-tree'
import { documentCustomerOptions } from '~/tinycld/books/lib/document-fills'
import { linePartyOptions } from '~/tinycld/books/lib/line-party-options'
import { productPickerOptions } from '~/tinycld/books/lib/product-list'
import { vendorPickerOptions } from '~/tinycld/books/lib/purchase-pickers'

const aspen = { id: 'a', display_name: 'Aspen Ridge Dental', code: 'ARD' }
const bard = { id: 'b', display_name: 'Bard Hall', code: 'BH' }

describe('pickers find a record by its code, code matches first', () => {
    it('parent customer picker', () => {
        expect(pickerOptions([bard, aspen], { term: 'ard', selfId: '' }).map(r => r.id)).toEqual([
            'a',
            'b',
        ])
    })

    it('document customer picker', () => {
        const customers = [
            { ...bard, parentName: undefined },
            { ...aspen, parentName: undefined },
        ]
        expect(documentCustomerOptions({ customers, term: 'ard' }).map(o => o.id)).toEqual([
            'a',
            'b',
        ])
    })

    it('product picker', () => {
        const rows = [
            { id: 'p1', name: 'Cleaning', sku: '', code: 'CLN' },
            { id: 'p2', name: 'Whitening', sku: '', code: 'WHT' },
        ]
        expect(productPickerOptions(rows, 'wht').map(r => r.id)).toEqual(['p2'])
    })

    it('vendor picker', () => {
        const vendors = [
            { ...bard, inactive: false },
            { id: 'c', display_name: 'Coastal Coffee', code: 'CC', inactive: false },
            { ...aspen, inactive: false },
        ]
        expect(vendorPickerOptions(vendors, '', 'ard').map(o => o.id)).toEqual(['a', 'b'])
    })

    it('journal line name picker', () => {
        const options = linePartyOptions({ customers: [bard, aspen], vendors: [], term: 'ard' })
        expect(options.map(o => o.id)).toEqual(['customer:a', 'customer:b'])
    })
})
