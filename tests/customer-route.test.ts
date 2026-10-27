import { describe, expect, it } from 'vitest'
import {
    CUSTOMERS_PATH,
    customerPath,
    navigationModeFor,
    newCustomerPath,
    openCustomerFromPath,
} from '../tinycld/books/lib/customer-route'

describe('customer routes', () => {
    it('CUSTOMERS_PATH is the list route', () => {
        expect(CUSTOMERS_PATH).toBe('books/customers')
    })

    it('customerPath names the [id] route with the id param', () => {
        expect(customerPath('abc')).toEqual({
            path: 'books/customers/[id]',
            params: { id: 'abc' },
        })
    })

    it('newCustomerPath has no params without a parent', () => {
        const route = newCustomerPath()
        expect(route.path).toBe('books/customers/new')
        expect(route.params).toBeUndefined()
    })

    it('newCustomerPath carries the parent param when given', () => {
        expect(newCustomerPath('p1')).toEqual({
            path: 'books/customers/new',
            params: { parent: 'p1' },
        })
    })
})

describe('openCustomerFromPath', () => {
    it.each(['/a/books/customers', '/a/books/customers/'])('is none on the list path %s', path => {
        expect(openCustomerFromPath(path)).toEqual({ kind: 'none' })
    })

    it('is new on the new path', () => {
        expect(openCustomerFromPath('/a/books/customers/new')).toEqual({ kind: 'new' })
    })

    it('is the id on a customer path', () => {
        expect(openCustomerFromPath('/a/books/customers/abc')).toEqual({ kind: 'id', id: 'abc' })
    })

    it('is none on a path outside customers', () => {
        expect(openCustomerFromPath('/a/books/accounts/abc')).toEqual({ kind: 'none' })
    })
})

describe('navigationModeFor', () => {
    it('pushes when no customer is open', () => {
        expect(navigationModeFor({ kind: 'none' })).toBe('push')
    })

    it('replaces when a new customer or an existing customer is open', () => {
        expect(navigationModeFor({ kind: 'new' })).toBe('replace')
        expect(navigationModeFor({ kind: 'id', id: 'abc' })).toBe('replace')
    })
})
