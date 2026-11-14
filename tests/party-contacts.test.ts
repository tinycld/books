import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS } from '../tinycld/books/lib/customer-form-fixture'
import { CUSTOMER_PAGE_CONTACTS } from '../tinycld/books/lib/customer-page-fixture'
import { sortContacts } from '../tinycld/books/lib/party-contacts'

const harborview = CUSTOMER_PAGE_CONTACTS.filter(c => c.customer === CUSTOMER_IDS.harborview)

describe('sortContacts', () => {
    it('puts the primary contact first, then the others by name', () => {
        expect(sortContacts(harborview).map(c => c.name)).toEqual([
            'Dana Whitfield',
            'Kim Tran',
            'Rafael Mendoza-Okafor',
        ])
    })

    it('keeps the order of two non-primary rows whose names differ only in case', () => {
        const lower = { id: 'lower', name: 'alex park', is_primary: false }
        const upper = { id: 'upper', name: 'Alex Park', is_primary: false }
        const zed = { id: 'zed', name: 'Zed Ames', is_primary: false }
        expect(sortContacts([zed, lower, upper]).map(c => c.id)).toEqual(['lower', 'upper', 'zed'])
        expect(sortContacts([upper, zed, lower]).map(c => c.id)).toEqual(['upper', 'lower', 'zed'])
    })

    it('does not change the input array', () => {
        const input = [...harborview]
        const before = input.map(c => c.id)
        const sorted = sortContacts(input)
        expect(input.map(c => c.id)).toEqual(before)
        expect(sorted).not.toBe(input)
    })
})
