import { describe, expect, it } from 'vitest'
import {
    chosenProductType,
    newProductPath,
    openProductFromPath,
    PRODUCT_DETAIL_SCREENS,
    PRODUCTS_PATH,
    productPath,
} from '../tinycld/books/lib/product-route'

describe('product routes', () => {
    it('PRODUCTS_PATH is the list route', () => {
        expect(PRODUCTS_PATH).toBe('books/products')
    })

    it('productPath names the [id] route with the id param', () => {
        expect(productPath('abc')).toEqual({
            path: 'books/products/[id]',
            params: { id: 'abc' },
        })
    })

    it('newProductPath with no type names the new route with no params key', () => {
        const route = newProductPath()
        expect(route).toEqual({ path: 'books/products/new' })
        expect('params' in route).toBe(false)
    })

    it('newProductPath with a type passes it as the type param', () => {
        expect(newProductPath('bundle')).toEqual({
            path: 'books/products/new',
            params: { type: 'bundle' },
        })
    })

    it('PRODUCT_DETAIL_SCREENS are the record screens', () => {
        expect(PRODUCT_DETAIL_SCREENS).toEqual(['[id]', 'new'])
    })
})

describe('openProductFromPath', () => {
    it('is none on the list path', () => {
        expect(openProductFromPath('/a/books/products')).toEqual({ kind: 'none' })
    })

    it('is new on the new path', () => {
        expect(openProductFromPath('/a/books/products/new')).toEqual({ kind: 'new' })
    })

    it('is the id on a product path', () => {
        expect(openProductFromPath('/a/books/products/abc')).toEqual({ kind: 'id', id: 'abc' })
    })

    it('is none on a vendor path', () => {
        expect(openProductFromPath('/a/books/vendors/abc')).toEqual({ kind: 'none' })
    })
})

describe('chosenProductType', () => {
    it('is the type a writer passed when it is valid', () => {
        expect(chosenProductType('service', true)).toBe('service')
    })

    it('is null for a value that is not a product type', () => {
        expect(chosenProductType('inventory', true)).toBeNull()
    })

    it('is null when no type was passed', () => {
        expect(chosenProductType(undefined, true)).toBeNull()
    })

    it('is null for a repeated param (an array)', () => {
        expect(chosenProductType(['service'], true)).toBeNull()
    })

    it('is null for a reader, even with a valid type', () => {
        expect(chosenProductType('service', false)).toBeNull()
    })
})
