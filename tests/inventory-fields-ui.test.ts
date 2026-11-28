// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import ui from '../tinycld/books/forms/ui'
import { QUANTITY_VALUE_SCHEMA } from '../tinycld/books/lib/quantity-input'

describe('the forms UI module', () => {
    it('provides the components of an Inventory item', () => {
        for (const name of [
            'AssetAccountField',
            'CogsAccountField',
            'PreferredVendorField',
            'QuantityField',
            'OpeningDateField',
        ]) {
            expect(ui.components[name], name).toBeTypeOf('function')
        }
    })

    // The figures show the quantity on hand (inventory-adjust spec §3.6): no host names a
    // read-only Quantity on hand field, so the module registers none.
    it('registers no Quantity on hand field', () => {
        expect(ui.components.QuantityOnHandField).toBeUndefined()
    })

    it('gives QuantityField the quantity value schema', () => {
        expect(ui.schemas?.QuantityField).toBe(QUANTITY_VALUE_SCHEMA)
    })
})
