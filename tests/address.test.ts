import { describe, expect, it } from 'vitest'
import {
    addressPartsSchema,
    EMPTY_ADDRESS,
    formatAddressLines,
    isCustomerAddress,
} from '../tinycld/books/lib/address'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'

const harborviewBilling = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)?.billing_address

describe('addressPartsSchema', () => {
    it('accepts the empty address', () => {
        expect(addressPartsSchema.safeParse(EMPTY_ADDRESS).success).toBe(true)
    })

    it('refuses a part longer than the server limit of 200 characters', () => {
        const result = addressPartsSchema.safeParse({ ...EMPTY_ADDRESS, city: 'x'.repeat(201) })
        expect(result.success).toBe(false)
    })

    // The server counts code points; a four-byte emoji is two UTF-16 units.
    it('counts characters as the server does: 200 emoji fit, 201 do not', () => {
        const city = (n: number) => '😀'.repeat(n)
        expect(addressPartsSchema.safeParse({ ...EMPTY_ADDRESS, city: city(200) }).success).toBe(
            true
        )
        expect(addressPartsSchema.safeParse({ ...EMPTY_ADDRESS, city: city(201) }).success).toBe(
            false
        )
    })
})

describe('isCustomerAddress', () => {
    it('accepts the empty address', () => {
        expect(isCustomerAddress(EMPTY_ADDRESS)).toBe(true)
    })

    it('refuses an extra key', () => {
        expect(isCustomerAddress({ ...EMPTY_ADDRESS, county: 'King' })).toBe(false)
    })

    it('refuses a missing key', () => {
        const { country: _country, ...withoutCountry } = EMPTY_ADDRESS
        expect(isCustomerAddress(withoutCountry)).toBe(false)
    })

    it('refuses a number value', () => {
        expect(isCustomerAddress({ ...EMPTY_ADDRESS, postal_code: 98101 })).toBe(false)
    })
})

describe('formatAddressLines', () => {
    it('prints street lines, the city line and the country', () => {
        expect(harborviewBilling).toBeTruthy()
        expect(formatAddressLines(harborviewBilling ?? null)).toEqual([
            '1450 Waterfront Avenue',
            'Suite 300',
            'Seattle, WA 98101',
            'United States',
        ])
    })

    it('drops empty lines', () => {
        const address = {
            ...EMPTY_ADDRESS,
            line1: '210 Main Street',
            city: 'Boise',
            region: 'ID',
            postal_code: '83702',
        }
        expect(formatAddressLines(address)).toEqual(['210 Main Street', 'Boise, ID 83702'])
        expect(formatAddressLines(EMPTY_ADDRESS)).toEqual([])
    })

    it('gives no lines for no address', () => {
        expect(formatAddressLines(null)).toEqual([])
    })
})
