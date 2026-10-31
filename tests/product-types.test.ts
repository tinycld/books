import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    isProductType,
    PRODUCT_TYPE_KEYS,
    PRODUCT_TYPE_SELECT_OPTIONS,
    PRODUCT_TYPES,
    productTypeLabel,
    productTypeNoun,
} from '../tinycld/books/lib/product-types'

// Read inside the test, so a missing migration fails the drift test only.
function migrationTypeValues() {
    const source = readFileSync(
        join(__dirname, '..', 'pb-migrations', '2100000005_create_books_products.js'),
        'utf8'
    )
    const field = source.match(/\{\s*name:\s*'type'[^}]*?values:\s*\[([^\]]*)\]/)
    if (!field) throw new Error("no select field named 'type' with values in the migration")
    return [...field[1].matchAll(/'([^']*)'/g)].map(match => match[1])
}

describe('PRODUCT_TYPES', () => {
    it('lists each type with its label, noun and chooser sentence, in order', () => {
        expect(PRODUCT_TYPES).toEqual([
            {
                key: 'service',
                label: 'Service',
                noun: 'service',
                sentence: 'Work you do for customers, such as consulting, repairs or lessons.',
            },
            {
                key: 'non_inventory',
                label: 'Non-inventory',
                noun: 'non-inventory item',
                sentence:
                    'Goods you buy or sell without counting how many you have, such as parts used on a job.',
            },
            {
                key: 'bundle',
                label: 'Bundle',
                noun: 'bundle',
                sentence:
                    'Products and services you sell together as one line, such as a starter kit.',
            },
        ])
    })

    it('PRODUCT_TYPE_KEYS are the keys of PRODUCT_TYPES', () => {
        expect(PRODUCT_TYPE_KEYS).toEqual(PRODUCT_TYPES.map(type => type.key))
    })
})

describe('productTypeLabel', () => {
    it('labels a known type and gives an unknown one no label', () => {
        expect(productTypeLabel('non_inventory')).toBe('Non-inventory')
        expect(productTypeLabel('inventory')).toBe('')
    })
})

describe('isProductType', () => {
    it('accepts a product type and refuses anything else', () => {
        expect(isProductType('bundle')).toBe(true)
        expect(isProductType('inventory')).toBe(false)
        expect(isProductType(3)).toBe(false)
    })
})

describe('productTypeNoun', () => {
    it('names a non-inventory item in running text', () => {
        expect(productTypeNoun('non_inventory')).toBe('non-inventory item')
    })
})

describe('PRODUCT_TYPE_SELECT_OPTIONS', () => {
    // A product never becomes a bundle after it is created, so the type field
    // offers only Service and Non-inventory.
    it('offers Service and Non-inventory only', () => {
        expect(PRODUCT_TYPE_SELECT_OPTIONS).toEqual([
            { value: 'service', label: 'Service' },
            { value: 'non_inventory', label: 'Non-inventory' },
        ])
    })
})

describe('migration drift', () => {
    it("the books_products type field's values are PRODUCT_TYPE_KEYS", () => {
        expect(migrationTypeValues()).toEqual([...PRODUCT_TYPE_KEYS])
    })
})
