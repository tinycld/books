import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPE_KEYS } from '../tinycld/books/lib/product-types'
import {
    ALL_INACTIVE_PRODUCTS,
    BUNDLE_ITEMS,
    PRODUCT_IDS,
    PRODUCTS,
} from '../tinycld/books/lib/products-services-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

function seedAccount(number: string) {
    return SEED_ACCOUNTS.find(account => account.number === number)
}

function productById(id: string) {
    const row = PRODUCTS.find(product => product.id === id)
    if (!row) throw new Error(`no fixture product ${id}`)
    return row
}

function countOf(predicate: (row: (typeof PRODUCTS)[number]) => boolean) {
    return PRODUCTS.filter(predicate).length
}

describe('products fixture', () => {
    it('seeds 12 services, 8 non-inventory items (5 purchasing) and 4 bundles', () => {
        expect(PRODUCTS).toHaveLength(24)
        expect(countOf(row => row.type === 'service')).toBe(12)
        expect(countOf(row => row.type === 'non_inventory')).toBe(8)
        expect(countOf(row => row.type === 'non_inventory' && row.purchases)).toBe(5)
        expect(countOf(row => row.type === 'bundle')).toBe(4)
    })

    it("uses only the migration's product types", () => {
        for (const row of PRODUCTS) {
            expect(PRODUCT_TYPE_KEYS, row.id).toContain(row.type)
        }
    })

    it('has exactly the two inactive products of ALL_INACTIVE_PRODUCTS', () => {
        const inactive = PRODUCTS.filter(row => row.inactive).map(row => row.name)
        expect([...inactive].sort()).toEqual(['Cable ties, 100 pack', 'Fax line setup'])
        expect(ALL_INACTIVE_PRODUCTS.map(row => row.name).sort()).toEqual([...inactive].sort())
    })

    it('has names that are unique without regard to case', () => {
        const names = PRODUCTS.map(row => row.name.toLowerCase())
        const repeated = names.filter((name, index) => names.indexOf(name) !== index)
        expect(repeated).toEqual([])
    })

    it('has ids the seed may send', () => {
        for (const row of [...PRODUCTS, ...BUNDLE_ITEMS]) {
            expect(row.id).toMatch(/^[a-z0-9]{15}$/)
        }
    })

    it('names only seeded accounts', () => {
        for (const row of PRODUCTS) {
            for (const number of [row.income_account_number, row.expense_account_number]) {
                if (number === '') continue
                expect(seedAccount(number), `${row.id} names ${number}`).toBeDefined()
            }
        }
    })

    it('gives the business laptop the seeded account that is inactive', () => {
        expect(productById(PRODUCT_IDS.laptop).expense_account_number).toBe('6900')
        expect(seedAccount('6900')?.inactive).toBe(true)
    })

    it('gives every bundle 2 to 5 rows in position order', () => {
        const bundles = PRODUCTS.filter(row => row.type === 'bundle')
        for (const bundle of bundles) {
            const positions = BUNDLE_ITEMS.filter(item => item.bundle === bundle.id).map(
                item => item.position
            )
            expect(positions.length, bundle.name).toBeGreaterThanOrEqual(2)
            expect(positions.length, bundle.name).toBeLessThanOrEqual(5)
            expect(positions, bundle.name).toEqual(positions.map((_, index) => index))
        }
    })

    it('puts the inactive cable ties on a bundle', () => {
        expect(productById(PRODUCT_IDS.cableTies).inactive).toBe(true)
        expect(BUNDLE_ITEMS.some(item => item.product === PRODUCT_IDS.cableTies)).toBe(true)
    })
})
