// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import ui from '../tinycld/books/forms/ui'
import { QUANTITY_VALUE_SCHEMA } from '../tinycld/books/lib/quantity-input'

describe('the forms UI module', () => {
    it('provides the components of an Inventory item', () => {
        for (const name of [
            'AssetAccountField',
            'PreferredVendorField',
            'QuantityField',
            'QuantityOnHandField',
            'OpeningDateField',
        ]) {
            expect(ui.components[name], name).toBeTypeOf('function')
        }
    })

    it('gives QuantityField the quantity value schema', () => {
        expect(ui.schemas?.QuantityField).toBe(QUANTITY_VALUE_SCHEMA)
    })
})
