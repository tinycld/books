import { describe, expect, expectTypeOf, it } from 'vitest'
import { BILL_PAYMENT_SEED, PAY_BILLS_SEED_BILLS } from '../tinycld/books/lib/pay-bills-fixture'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import {
    VENDOR_PAGE_BALANCES,
    VENDOR_PAGE_CONTACTS,
    VENDOR_PAGE_TODAY,
    type VendorPartyBalanceRecord,
} from '../tinycld/books/lib/vendor-page-fixture'
import type { BooksPartyBalances } from '../tinycld/books/types'

const VENDOR_ID_VALUES = new Set<string>(VENDORS.map(vendor => vendor.id))

describe('generated vendor page types', () => {
    it('the balance row type is the generated view row', () => {
        // tsc fails here until the migration adds the vendor column and the types are generated.
        expectTypeOf<VendorPartyBalanceRecord>().toEqualTypeOf<BooksPartyBalances>()
    })
})

describe('vendor page balances', () => {
    it('every balance row is a vendor row whose id is its vendor', () => {
        for (const row of VENDOR_PAGE_BALANCES) {
            expect(row.customer, row.id).toBe('')
            expect(row.id).toBe(row.vendor)
        }
    })
})

describe('vendor page contacts', () => {
    it('every contact names no customer and a seeded vendor', () => {
        for (const contact of VENDOR_PAGE_CONTACTS) {
            expect(contact.customer, contact.id).toBe('')
            expect(
                VENDOR_ID_VALUES.has(contact.vendor),
                `${contact.id} vendor ${contact.vendor}`
            ).toBe(true)
        }
    })

    it('gives every contact a PocketBase id of 15 characters', () => {
        for (const contact of VENDOR_PAGE_CONTACTS) {
            expect(contact.id).toMatch(/^[a-z0-9]{15}$/)
        }
    })

    it('has at most one primary contact per vendor', () => {
        const primaries = new Map<string, string[]>()
        for (const contact of VENDOR_PAGE_CONTACTS) {
            if (!contact.is_primary) continue
            primaries.set(contact.vendor, [...(primaries.get(contact.vendor) ?? []), contact.id])
        }
        for (const [vendor, ids] of primaries) {
            expect(ids, vendor).toEqual([ids[0]])
        }
    })

    it('gives contacts to exactly three vendors, Office Supply World and Willamette with a primary', () => {
        const vendors = new Set(VENDOR_PAGE_CONTACTS.map(contact => contact.vendor))
        expect([...vendors].sort()).toEqual(
            [VENDOR_IDS.officeSupply, VENDOR_IDS.willamette, VENDOR_IDS.okafor].sort()
        )
        const withPrimary = [...vendors].filter(vendor =>
            VENDOR_PAGE_CONTACTS.some(contact => contact.vendor === vendor && contact.is_primary)
        )
        expect(withPrimary.sort()).toEqual([VENDOR_IDS.officeSupply, VENDOR_IDS.willamette].sort())
    })
})

describe('seeded overdue bill', () => {
    it('Office Supply World has a posted bill past due with a balance above 0 after its payment', () => {
        const bill = PAY_BILLS_SEED_BILLS.find(row => row.key === 'partial')
        const payment = BILL_PAYMENT_SEED.find(row => row.key === 'partial')
        expect(bill?.vendor).toBe(VENDOR_IDS.officeSupply)
        expect(payment?.billMemo).toBe(bill?.memo)
        expect((bill?.due_date ?? '') < VENDOR_PAGE_TODAY).toBe(true)
        expect(bill?.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect((bill?.amount ?? 0) - (payment?.amount ?? Number.POSITIVE_INFINITY)).toBeGreaterThan(
            0
        )
    })
})
