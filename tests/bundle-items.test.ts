import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import { describe, expect, it } from 'vitest'
import {
    BUNDLE_ITEM_COLUMNS,
    BUNDLE_ITEM_MAPPER,
    type BundleItemRow,
} from '../tinycld/books/lib/bundle-items'

describe('BUNDLE_ITEM_MAPPER', () => {
    it('reads stored items into table rows in position order', () => {
        const items: BundleItemRow[] = [
            { id: 'i1', product: 'p1', quantity: 1, position: 2 },
            { id: 'i2', product: 'p2', quantity: 2.5, position: 0 },
            { id: 'i3', product: 'p3', quantity: 10, position: 1 },
        ]
        expect(tableRowsOf(items, BUNDLE_ITEM_MAPPER)).toEqual([
            { id: 'i2', product: 'p2', quantity: 2.5 },
            { id: 'i3', product: 'p3', quantity: 10 },
            { id: 'i1', product: 'p1', quantity: 1 },
        ])
    })

    it('writes a row as its product, quantity and position, never its id', () => {
        expect(BUNDLE_ITEM_MAPPER.toRecord({ id: 'r1', product: 'p1', quantity: 2.5 }, 3)).toEqual({
            product: 'p1',
            quantity: 2.5,
            position: 3,
        })
    })

    it('writes an empty product and a zero quantity for blank cells', () => {
        expect(BUNDLE_ITEM_MAPPER.toRecord({ id: 'r2', product: null, quantity: null }, 0)).toEqual(
            { product: '', quantity: 0, position: 0 }
        )
    })
})

describe('BUNDLE_ITEM_COLUMNS', () => {
    it('is the product picker column and the quantity column', () => {
        expect(BUNDLE_ITEM_COLUMNS).toEqual([
            {
                key: 'product',
                label: 'Product or service',
                kind: 'text',
                required: true,
                hidden: false,
                component: 'BundleProductCell',
            },
            {
                key: 'quantity',
                label: 'Qty',
                kind: 'number',
                required: true,
                hidden: false,
                min: 0.01,
                max: 1000000,
            },
        ])
    })
})
