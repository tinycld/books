import { describe, expect, it } from 'vitest'
import {
    newVendorPath,
    openVendorFromPath,
    VENDORS_PATH,
    vendorPath,
} from '../tinycld/books/lib/vendor-route'

describe('vendor routes', () => {
    it('VENDORS_PATH is the list route', () => {
        expect(VENDORS_PATH).toBe('books/vendors')
    })

    it('vendorPath names the [id] route with the id param', () => {
        expect(vendorPath('abc')).toEqual({
            path: 'books/vendors/[id]',
            params: { id: 'abc' },
        })
    })

    it('newVendorPath names the new route with no params', () => {
        const route = newVendorPath()
        expect(route).toEqual({ path: 'books/vendors/new' })
        expect(route.params).toBeUndefined()
    })
})

describe('openVendorFromPath', () => {
    it('is none on the list path', () => {
        expect(openVendorFromPath('/a/books/vendors')).toEqual({ kind: 'none' })
    })

    it('is new on the new path', () => {
        expect(openVendorFromPath('/a/books/vendors/new')).toEqual({ kind: 'new' })
    })

    it('is the id on a vendor path', () => {
        expect(openVendorFromPath('/a/books/vendors/abc')).toEqual({ kind: 'id', id: 'abc' })
    })

    it('is none on a customer path', () => {
        expect(openVendorFromPath('/a/books/customers/abc')).toEqual({ kind: 'none' })
    })
})
