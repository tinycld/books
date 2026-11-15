import { describe, expect, expectTypeOf, it } from 'vitest'
import { CUSTOMER_IDS } from '../tinycld/books/lib/customer-form-fixture'
import {
    CUSTOMER_PAGE_BALANCES,
    CUSTOMER_PAGE_CONTACTS,
    CUSTOMER_PAGE_INVOICES,
    type PartyBalanceRecord,
    type PartyContactRecord,
} from '../tinycld/books/lib/customer-page-fixture'
import type { BooksPartyBalances, BooksPartyContacts } from '../tinycld/books/types'

const CUSTOMER_ID_VALUES = new Set<string>(Object.values(CUSTOMER_IDS))

describe('generated customer page types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migrations and the generated types exist.
        expectTypeOf<PartyBalanceRecord>().toEqualTypeOf<BooksPartyBalances>()
        expectTypeOf<PartyContactRecord>().toEqualTypeOf<BooksPartyContacts>()
    })
})

describe('customer page contacts', () => {
    it('every contact names exactly one party, a seeded customer', () => {
        for (const contact of CUSTOMER_PAGE_CONTACTS) {
            const parties = [contact.customer, contact.vendor].filter(id => id !== '')
            expect(parties, contact.id).toHaveLength(1)
            expect(CUSTOMER_ID_VALUES.has(parties[0]), contact.id).toBe(true)
        }
    })

    it('has at most one primary contact per customer', () => {
        const primaries = new Map<string, string[]>()
        for (const contact of CUSTOMER_PAGE_CONTACTS) {
            if (!contact.is_primary) continue
            primaries.set(contact.customer, [
                ...(primaries.get(contact.customer) ?? []),
                contact.id,
            ])
        }
        for (const [customer, ids] of primaries) {
            expect(ids, customer).toHaveLength(1)
        }
    })

    it('gives every contact a PocketBase id of 15 characters', () => {
        for (const contact of CUSTOMER_PAGE_CONTACTS) {
            expect(contact.id).toMatch(/^[a-z0-9]{15}$/)
        }
    })
})

describe('customer page balances', () => {
    it("Harborview's balance is the sum of its posted invoices", () => {
        const harbor = CUSTOMER_IDS.harborview
        const posted = CUSTOMER_PAGE_INVOICES.filter(
            inv => inv.customer === harbor && inv.status === 'posted'
        ).reduce((sum, inv) => sum + inv.total, 0)
        expect(posted).toBe(2_781_865)
        expect(CUSTOMER_PAGE_BALANCES.find(row => row.customer === harbor)?.balance).toBe(posted)
    })
})
