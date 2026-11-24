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
        const error = refusalOf('service', { name: 'A', type: 'subscription' })
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

    // A new Non-inventory item starts taxable; switched to Bundle, the hidden toggle still
    // holds true, and the server refuses a taxable bundle on a field the user cannot see.
    it('writes a bundle not taxable, whatever the hidden toggle held', () => {
        expect(columnsOf('bundle', { taxable: true })).toEqual({ taxable: false })
    })

    it('keeps a taxable service taxable', () => {
        expect(columnsOf('service', { taxable: true })).toEqual({ taxable: true })
    })

    it('refuses a taxable that is not on or off', () => {
        const error = refusalOf('service', { name: 'A', taxable: 'yes' })
        expect(error.issues.map(issue => issue.path[0])).toContain('taxable')
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

    it('accepts the fields of an Inventory item', () => {
        const columns = {
            type: 'inventory',
            name: 'Widget',
            asset_account: 'acc1300',
            preferred_vendor: 'ven1',
            opening_quantity: 12.5,
            opening_value: 12500,
            opening_date: '2026-07-01',
            reorder_point: 4,
        }
        expect(columnsOf('inventory', columns)).toEqual(columns)
    })

    it('refuses opening quantity text', () => {
        const error = refusalOf('inventory', { name: 'A', opening_quantity: '12.5' })
        expect(error.issues.map(issue => issue.path[0])).toEqual(['opening_quantity'])
    })

    it('drops opening value text, as the other money fields', () => {
        expect(columnsOf('inventory', { name: 'A', opening_value: 'abc' })).toEqual({ name: 'A' })
    })

    // Books counts them; the server refuses a write of either.
    it('never writes the quantity on hand or the stock value', () => {
        expect(
            columnsOf('inventory', { name: 'A', quantity_on_hand: 7, stock_value: 700 })
        ).toEqual({ name: 'A' })
    })
})

describe('EMPTY_PRODUCT_FIELDS', () => {
    it('is a service with every text empty, no money, purchasing off and not taxable', () => {
        expect(EMPTY_PRODUCT_FIELDS).toEqual({
            type: 'service',
            name: '',
            sku: '',
            sales_description: '',
            price: 0,
            income_account: '',
            taxable: false,
            purchases: false,
            purchase_description: '',
            cost: 0,
            expense_account: '',
            asset_account: '',
            preferred_vendor: '',
            opening_quantity: 0,
            opening_value: 0,
            opening_date: '',
            reorder_point: 0,
        })
    })
})

describe('EMPTY_PRODUCT_COLUMNS', () => {
    it('is every empty field plus inactive false', () => {
        expect(EMPTY_PRODUCT_COLUMNS).toEqual({ ...EMPTY_PRODUCT_FIELDS, inactive: false })
    })
})
