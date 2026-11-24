import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    ASSET_ACCOUNT_FIXED,
    ASSET_ACCOUNT_INACTIVE,
    ASSET_ACCOUNT_MISSING,
    ASSET_ACCOUNT_TYPE,
    COGS_ACCOUNT_TYPE,
    INVENTORY_KEEPS_TYPE,
    INVENTORY_ONLY_NEW,
    INVENTORY_TYPE_FIXED,
    OPENING_DATE_REQUIRED,
    OPENING_QUANTITY_DECIMALS,
    OPENING_QUANTITY_NEGATIVE,
    OPENING_QUANTITY_REQUIRED,
    PREFERRED_VENDOR_MISSING,
    QUANTITY_DECIMALS,
    QUANTITY_MALFORMED,
    QUANTITY_NEGATIVE,
    QUANTITY_TOO_LARGE,
} from '../tinycld/books/lib/product-messages'

describe('Inventory item texts', () => {
    it('are the server refusals of an Inventory item', () => {
        expect(INVENTORY_TYPE_FIXED).toBe('An Inventory item cannot change type.')
        expect(INVENTORY_ONLY_NEW).toBe('Only a new product can be an Inventory item.')
        expect(ASSET_ACCOUNT_MISSING).toBe('The inventory asset account does not exist.')
        expect(ASSET_ACCOUNT_INACTIVE).toBe('The inventory asset account is inactive.')
        expect(ASSET_ACCOUNT_TYPE).toBe(
            'The inventory asset account must be an Other current asset account.'
        )
        expect(ASSET_ACCOUNT_FIXED).toBe(
            'The inventory asset account cannot change after the item has stock transactions.'
        )
        expect(COGS_ACCOUNT_TYPE).toBe(
            'The cost of goods sold account must be a Cost of goods sold account.'
        )
        expect(PREFERRED_VENDOR_MISSING).toBe('The preferred vendor does not exist.')
        expect(OPENING_DATE_REQUIRED).toBe('Enter the date of the opening quantity.')
        expect(OPENING_QUANTITY_REQUIRED).toBe('Enter an opening quantity for the opening value.')
        expect(OPENING_QUANTITY_DECIMALS).toBe('Enter an opening quantity with at most 2 decimals.')
        expect(OPENING_QUANTITY_NEGATIVE).toBe('An opening quantity cannot be below 0.')
    })

    it('are the client-only texts of the type field and the quantity input', () => {
        expect(INVENTORY_KEEPS_TYPE).toBe('An inventory item keeps its type.')
        expect(QUANTITY_MALFORMED).toBe('Enter a quantity such as 12.5')
        expect(QUANTITY_NEGATIVE).toBe('Enter a quantity of 0 or more')
        expect(QUANTITY_DECIMALS).toBe('Enter a quantity with at most 2 decimals')
        expect(QUANTITY_TOO_LARGE).toBe('Too large')
    })
})

describe('server drift', () => {
    // Read inside the test, so a missing server file fails the drift test only.
    it('server/product_stock.go holds each Inventory item refusal', () => {
        const source = readFileSync(join(__dirname, '..', 'server', 'product_stock.go'), 'utf8')
        for (const message of [
            INVENTORY_TYPE_FIXED,
            INVENTORY_ONLY_NEW,
            ASSET_ACCOUNT_MISSING,
            ASSET_ACCOUNT_INACTIVE,
            ASSET_ACCOUNT_TYPE,
            ASSET_ACCOUNT_FIXED,
            COGS_ACCOUNT_TYPE,
            PREFERRED_VENDOR_MISSING,
            OPENING_DATE_REQUIRED,
            OPENING_QUANTITY_REQUIRED,
            OPENING_QUANTITY_DECIMALS,
            OPENING_QUANTITY_NEGATIVE,
        ]) {
            expect(source, message).toContain(`"${message}"`)
        }
    })
})
