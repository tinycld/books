import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import {
    EMPTY_PRODUCT_COLUMNS,
    EMPTY_PRODUCT_FIELDS,
    productColumnsFor,
} from '../tinycld/books/lib/product-columns'
import type { ProductType } from '../tinycld/books/lib/product-types'

function columnsOf(type: ProductType, columns: Record<string, unknown>) {
    const result = productColumnsFor(type, columns)
    if (!result.success) throw new Error(`refused ${JSON.stringify(columns)}`)
    return result.columns
}

function refusalOf(type: ProductType, columns: Record<string, unknown>) {
    const result = productColumnsFor(type, columns)
    if (result.success) throw new Error(`accepted ${JSON.stringify(columns)}`)
    return result.error
}

describe('productColumnsFor', () => {
    it('accepts a service name and price and returns exactly those keys', () => {
        expect(columnsOf('service', { name: 'A', price: 1250 })).toEqual({ name: 'A', price: 1250 })
    })

    it('refuses a number in name', () => {
        const error = refusalOf('service', { name: 42 })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('name')
    })

    it('refuses a type outside the product types', () => {
        const error = refusalOf('service', { name: 'A', type: 'inventory' })
        expect(error.issues.map(issue => issue.path[0])).toContain('type')
    })

    it('refuses a column the product does not have', () => {
        const error = refusalOf('service', { name: 'A', parent: 'x' })
        const unknownKeys = error.issues.flatMap(issue =>
            issue.code === 'unrecognized_keys' ? issue.keys : []
        )
        expect(unknownKeys).toEqual(['parent'])
    })

    it("writes a bundle's price, cost, accounts and purchase fields empty, whatever the form held", () => {
        const columns = columnsOf('bundle', {
            type: 'bundle',
            name: 'Kit',
            price: 500,
            cost: 10,
            income_account: 'acc1',
            expense_account: 'acc2',
            purchase_description: 'x',
            purchases: true,
        })
        expect(columns).toEqual({
            type: 'bundle',
            name: 'Kit',
            price: 0,
            cost: 0,
            income_account: '',
            expense_account: '',
            purchase_description: '',
            purchases: false,
        })
    })

    it('sends no emptied key for a bundle edit that changed only its name', () => {
        expect(columnsOf('bundle', { name: 'Kit' })).toEqual({ name: 'Kit' })
    })

    it("drops a hidden money field's text and keeps the rest", () => {
        expect(columnsOf('non_inventory', { name: 'A', cost: 'abc', price: 500 })).toEqual({
            name: 'A',
            price: 500,
        })
    })
})

describe('EMPTY_PRODUCT_FIELDS', () => {
    it('is a service with every text empty, no money and purchasing off', () => {
        expect(EMPTY_PRODUCT_FIELDS).toEqual({
            type: 'service',
            name: '',
            sku: '',
            sales_description: '',
            price: 0,
            income_account: '',
            purchases: false,
            purchase_description: '',
            cost: 0,
            expense_account: '',
        })
    })
})

describe('EMPTY_PRODUCT_COLUMNS', () => {
    it('is every empty field plus inactive false', () => {
        expect(EMPTY_PRODUCT_COLUMNS).toEqual({ ...EMPTY_PRODUCT_FIELDS, inactive: false })
    })
})
