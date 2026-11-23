import { describe, expect, it } from 'vitest'
import { PUBLIC_ROWS } from '../tinycld/books/lib/estimate-public-link-fixture'
import {
    businessNameOf,
    contactLeadOf,
    contactOf,
    contactUrlsOf,
} from '../tinycld/books/lib/public-page'

// The pure rules the customer's pages share (the estimate page and the invoice page).
const BUSINESS = 'Hartwell Supply Co.'

describe('businessNameOf', () => {
    it('takes the trimmed Books business name', () => {
        expect(businessNameOf({ business_name: '  Hartwell Supply Co.  ' }, 'Acme Org')).toBe(
            BUSINESS
        )
    })

    it('falls back to the deployment name when the business name is empty or spaces', () => {
        expect(businessNameOf({ business_name: '' }, 'Acme Org')).toBe('Acme Org')
        expect(businessNameOf({ business_name: '   ' }, 'Acme Org')).toBe('Acme Org')
    })
})

describe('contactOf', () => {
    const withContact = (business_email: string, business_phone: string) => ({
        ...PUBLIC_ROWS.pending,
        business_email,
        business_phone,
    })

    it('is null when neither email nor phone is set', () => {
        expect(contactOf(withContact('', ''))).toBeNull()
    })

    it('keeps only the email when only the email is set', () => {
        expect(contactOf(withContact('books@hartwell.example', ''))).toEqual({
            email: 'books@hartwell.example',
            phone: '',
        })
    })

    it('keeps both when both are set', () => {
        expect(contactOf(withContact('books@hartwell.example', '+1 214 555 1234'))).toEqual({
            email: 'books@hartwell.example',
            phone: '+1 214 555 1234',
        })
    })
})

describe('contactLeadOf', () => {
    it('invites questions, naming the business', () => {
        expect(contactLeadOf(BUSINESS)).toBe('Questions? Contact Hartwell Supply Co.')
    })
})

describe('contactUrlsOf', () => {
    it('builds the mailto and the tel link, the phone without spaces', () => {
        expect(
            contactUrlsOf({ email: 'books@hartwell.example', phone: '+1 214 555 1234' })
        ).toEqual({
            mailto: 'mailto:books@hartwell.example',
            tel: 'tel:+12145551234',
        })
    })
})
