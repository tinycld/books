import { describe, expect, it } from 'vitest'
import {
    BUNDLE_ITEM_TYPES,
    PURCHASE_ITEM_TYPES,
    SALE_ITEM_TYPES,
    SALE_PERCENT_TYPES,
} from '../tinycld/books/lib/product-picker-types'
import { PRODUCT_TYPE_KEYS } from '../tinycld/books/lib/product-types'

describe('product picker types', () => {
    it('lets a bundle hold an Inventory item, and never another bundle', () => {
        expect(BUNDLE_ITEM_TYPES).toEqual(['service', 'non_inventory', 'inventory'])
    })

    it('offers every product type on an Item line of a sale', () => {
        expect([...SALE_ITEM_TYPES].sort()).toEqual([...PRODUCT_TYPE_KEYS].sort())
    })

    // A Percent line has no quantity, so it cannot move stock.
    it('offers no Inventory item and no bundle on a Percent line', () => {
        expect(SALE_PERCENT_TYPES).toEqual(['service', 'non_inventory'])
    })

    it('offers an Inventory item, and no bundle, on a purchase line', () => {
        expect(PURCHASE_ITEM_TYPES).toEqual(['service', 'non_inventory', 'inventory'])
    })
})
