import { describe, expect, it } from 'vitest'
import { TAX_IDS } from '../tinycld/books/lib/tax-rates-fixture'
import {
    agencyFormDefaults,
    agencyPatch,
    groupFormDefaults,
    groupLine,
    groupPatch,
    rateFormDefaults,
    ratePatch,
    ratePreview,
} from '../tinycld/books/lib/tax-writes'
import { seedChart, taxAccount } from './tax-accounts'

const inactiveLiability = taxAccount({
    number: '2210',
    name: 'Old city sales tax',
    type: 'other_current_liability',
    detail_type: 'sales_tax_payable',
    inactive: true,
})

const storedAgency = { name: 'City and County of Denver', account: 'acc-2200' }

const lodging = { name: 'Denver lodging', rate_ppm: 88_750, agency: TAX_IDS.denver }

describe('agencyFormDefaults', () => {
    it('starts a new agency with no name and the Sales tax payable account', () => {
        expect(agencyFormDefaults(undefined, seedChart())).toEqual({
            name: '',
            account: 'acc-2200',
        })
    })

    it('keeps the stored account of an edited agency even when it is inactive', () => {
        const stored = { name: 'City and County of Denver', account: 'acc-2210' }
        expect(agencyFormDefaults(stored, [...seedChart(), inactiveLiability])).toEqual({
            name: 'City and County of Denver',
            account: 'acc-2210',
        })
    })
})

describe('agencyPatch', () => {
    it('sends only the name when the name changed and the account did not', () => {
        expect(agencyPatch(storedAgency, { name: 'Denver revenue', account: 'acc-2200' })).toEqual({
            name: 'Denver revenue',
        })
    })

    it('sends only the account when the account changed', () => {
        expect(
            agencyPatch(storedAgency, { name: 'City and County of Denver', account: 'acc-2210' })
        ).toEqual({ account: 'acc-2210' })
    })

    it('sends nothing when nothing changed', () => {
        expect(agencyPatch(storedAgency, { ...storedAgency })).toEqual({})
    })
})

describe('rateFormDefaults', () => {
    it('shows a stored 88 750 ppm rate as 8.875 and keeps its own agency', () => {
        expect(rateFormDefaults(lodging, 'x')).toEqual({
            name: 'Denver lodging',
            rate: '8.875',
            agency: TAX_IDS.denver,
        })
    })

    it('shows a stored 0 ppm rate as 0', () => {
        expect(rateFormDefaults({ ...lodging, rate_ppm: 0 }, 'x').rate).toBe('0')
    })

    it('starts a new rate blank with the agency it was opened from', () => {
        expect(rateFormDefaults(undefined, 'x')).toEqual({ name: '', rate: '', agency: 'x' })
    })
})

describe('ratePatch', () => {
    it('sends nothing for 8.8750 against a stored 88 750 ppm (the same rate)', () => {
        expect(
            ratePatch(lodging, { name: 'Denver lodging', rate: '8.8750', agency: lodging.agency })
        ).toEqual({})
    })

    it('sends the rate in ppm when it changed', () => {
        expect(
            ratePatch(lodging, { name: 'Denver lodging', rate: '9', agency: lodging.agency })
        ).toEqual({ rate_ppm: 90_000 })
    })
})

describe('ratePreview', () => {
    it('gives the tax on $100.00 for a valid rate', () => {
        expect(ratePreview('8.875', 'USD')).toBe('Tax on $100.00: $8.88')
    })

    it.each(['8.88888', ''])('is blank while the rate %j is invalid', text => {
        expect(ratePreview(text, 'USD')).toBe('')
    })
})

// A stored group whose rates include Retired rate, which became inactive after the
// group was saved.
const storedGroup = {
    name: 'Denver combined',
    components: [TAX_IDS.state, TAX_IDS.retired, TAX_IDS.denverCity],
}

describe('groupFormDefaults', () => {
    it('keeps every stored rate of an edited group, the inactive one included', () => {
        expect(groupFormDefaults(storedGroup)).toEqual({
            name: 'Denver combined',
            components: [TAX_IDS.state, TAX_IDS.retired, TAX_IDS.denverCity],
        })
    })

    it('starts a new group with no name and no rates', () => {
        expect(groupFormDefaults(undefined)).toEqual({ name: '', components: [] })
    })
})

describe('groupPatch', () => {
    it('sends nothing for the same rates in another order and the same name', () => {
        expect(
            groupPatch(storedGroup, {
                name: 'Denver combined',
                components: [TAX_IDS.denverCity, TAX_IDS.state, TAX_IDS.retired],
            })
        ).toEqual({})
    })

    it('sends only the name when the name changed', () => {
        expect(
            groupPatch(storedGroup, {
                name: 'Denver metro',
                components: [...storedGroup.components],
            })
        ).toEqual({ name: 'Denver metro' })
    })

    it('sends the rates when one was added', () => {
        const components = [...storedGroup.components, TAX_IDS.rtd]
        expect(groupPatch(storedGroup, { name: 'Denver combined', components })).toEqual({
            components,
        })
    })
})

describe('groupLine', () => {
    it('rounds each rate before adding: 8.25% as two 4.125% rates is $8.26, not $8.25', () => {
        expect(groupLine([41_250, 41_250], 'USD')).toBe(
            'Combined rate: 8.25% · Tax on $100.00: $8.26'
        )
    })

    it('gives $8.99 for Denver lodging with the cultural district (8.98%)', () => {
        expect(groupLine([88_750, 1_050], 'USD')).toBe(
            'Combined rate: 8.98% · Tax on $100.00: $8.99'
        )
    })

    it('is blank with no rate', () => {
        expect(groupLine([], 'USD')).toBe('')
    })
})
