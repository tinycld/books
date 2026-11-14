import { describe, expect, it } from 'vitest'
import {
    businessNameOf,
    contactOf,
    outcomeTextOf,
    publicDatesOf,
    publicHeadingOf,
    publicOutcomeOf,
    publicTitleOf,
} from '../tinycld/books/lib/estimate-public'
import { PUBLIC_ROWS } from '../tinycld/books/lib/estimate-public-link-fixture'

// The customer's page (spec §3.2, §3.4), its pure rules. Today is the fixture's today.
const TODAY = '2026-11-12'
const BUSINESS = 'Hartwell Supply Co.'

describe('publicOutcomeOf', () => {
    it('names the state of each fixture row', () => {
        expect(publicOutcomeOf(PUBLIC_ROWS.pending, TODAY)).toBe('decide')
        expect(publicOutcomeOf(PUBLIC_ROWS.expired, TODAY)).toBe('expired')
        expect(publicOutcomeOf(PUBLIC_ROWS.accepted, TODAY)).toBe('accepted')
        expect(publicOutcomeOf(PUBLIC_ROWS.rejected, TODAY)).toBe('declined')
        expect(publicOutcomeOf(PUBLIC_ROWS.closed, TODAY)).toBe('closed')
    })

    it('lets a pending estimate with no expiration date decide', () => {
        expect(PUBLIC_ROWS.pendingBare.expiration_date).toBe('')
        expect(publicOutcomeOf(PUBLIC_ROWS.pendingBare, TODAY)).toBe('decide')
    })

    it('expires a pending estimate only after its expiration day', () => {
        expect(publicOutcomeOf({ status: 'pending', expiration_date: '2026-11-12' }, TODAY)).toBe(
            'decide'
        )
        expect(publicOutcomeOf({ status: 'pending', expiration_date: '2026-11-11' }, TODAY)).toBe(
            'expired'
        )
    })

    it('never expires an answered estimate', () => {
        expect(publicOutcomeOf({ status: 'accepted', expiration_date: '2026-10-31' }, TODAY)).toBe(
            'accepted'
        )
    })
})

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

describe('publicTitleOf', () => {
    it('names the estimate and the business', () => {
        expect(publicTitleOf('1001', BUSINESS)).toBe('Estimate 1001 · Hartwell Supply Co.')
    })
})

describe('publicHeadingOf', () => {
    it('names the estimate and the customer', () => {
        expect(publicHeadingOf(PUBLIC_ROWS.pending)).toBe(
            'Estimate 1001 for Harborview Hospitality Group'
        )
    })
})

describe('publicDatesOf', () => {
    it('shows the estimate date and the expiration date', () => {
        expect(publicDatesOf(PUBLIC_ROWS.pending)).toBe(
            'Estimate date Nov 2, 2026 · Expires Jan 15, 2027'
        )
    })

    it('drops Expires when there is no expiration date', () => {
        const dates = publicDatesOf(PUBLIC_ROWS.pendingBare)
        expect(dates).toMatch(/^Estimate date [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
        expect(dates).not.toContain('Expires')
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

describe('outcomeTextOf', () => {
    it('says when the customer accepted and who accepted', () => {
        const row = PUBLIC_ROWS.accepted
        expect(row.accepted_date).toBe('2026-10-24')
        expect(outcomeTextOf('accepted', row, BUSINESS)).toEqual([
            'You accepted this estimate on Oct 24, 2026.',
            `Accepted by ${row.accepted_by}.`,
        ])
    })

    it('drops Accepted by when no name is stored', () => {
        expect(
            outcomeTextOf('accepted', { ...PUBLIC_ROWS.accepted, accepted_by: '' }, BUSINESS)
        ).toEqual(['You accepted this estimate on Oct 24, 2026.'])
    })

    it('says the customer declined', () => {
        expect(outcomeTextOf('declined', PUBLIC_ROWS.rejected, BUSINESS)).toEqual([
            'You declined this estimate.',
        ])
    })

    it('says the business turned it into an invoice', () => {
        expect(outcomeTextOf('closed', PUBLIC_ROWS.closed, BUSINESS)).toEqual([
            'Hartwell Supply Co. has turned this estimate into an invoice.',
        ])
    })

    it('says when it expired and whom to contact', () => {
        expect(outcomeTextOf('expired', PUBLIC_ROWS.expired, BUSINESS)).toEqual([
            'This estimate expired on Oct 31, 2026. Contact Hartwell Supply Co. for a new one.',
        ])
    })
})
