import { describe, expect, it } from 'vitest'
import { rateAgencyOptions } from '../tinycld/books/lib/tax-rate-options'
import { TAX_AGENCIES, TAX_IDS } from '../tinycld/books/lib/tax-rates-fixture'

describe('rateAgencyOptions', () => {
    it('lists the active agencies in name order and leaves the inactive one out', () => {
        expect(rateAgencyOptions(TAX_AGENCIES, '')).toEqual([
            { value: TAX_IDS.denver, label: 'City and County of Denver' },
            { value: TAX_IDS.colorado, label: 'Colorado Department of Revenue' },
        ])
    })

    it('keeps a stored inactive agency, marked inactive, in its name place', () => {
        expect(rateAgencyOptions(TAX_AGENCIES, TAX_IDS.oldCounty)).toEqual([
            { value: TAX_IDS.denver, label: 'City and County of Denver' },
            { value: TAX_IDS.colorado, label: 'Colorado Department of Revenue' },
            { value: TAX_IDS.oldCounty, label: 'Old county agency (inactive)' },
        ])
    })

    it('sorts the stored inactive agency among the active ones, not after them', () => {
        const pueblo = { id: 'taxagpueblo0001', name: 'Pueblo County', inactive: false }
        expect(
            rateAgencyOptions([pueblo, ...TAX_AGENCIES], TAX_IDS.oldCounty).map(o => o.label)
        ).toEqual([
            'City and County of Denver',
            'Colorado Department of Revenue',
            'Old county agency (inactive)',
            'Pueblo County',
        ])
    })
})
