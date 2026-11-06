import { describe, expect, it } from 'vitest'
import { groupComponentOptions, rateAgencyOptions } from '../tinycld/books/lib/tax-rate-options'
import { TAX_AGENCIES, TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

const DENVER = 'City and County of Denver'
const COLORADO = 'Colorado Department of Revenue'

// The active rates of the fixture, agency by agency (City and County of Denver sorts
// before Colorado Department of Revenue), each agency's rates in name order.
const ACTIVE_RATE_OPTIONS = [
    { value: TAX_IDS.denverCity, label: `Denver city 4.81% · ${DENVER}` },
    { value: TAX_IDS.lodging, label: `Denver lodging 8.875% · ${DENVER}` },
    { value: TAX_IDS.adams, label: `Adams County 0.75% · ${COLORADO}` },
    { value: TAX_IDS.state, label: `Colorado state 2.9% · ${COLORADO}` },
    { value: TAX_IDS.foodExempt, label: `Exempt food sales (state) 0% · ${COLORADO}` },
    { value: TAX_IDS.rtd, label: `RTD transit 1% · ${COLORADO}` },
    {
        value: TAX_IDS.culturalDistrict,
        label: `Scientific and Cultural Facilities District, seven-county Denver metro area 0.105% · ${COLORADO}`,
    },
]

describe('groupComponentOptions', () => {
    it("lists the active rates by agency, then name: Denver's first, then Colorado's", () => {
        const options = groupComponentOptions(TAX_RATE_ROWS, TAX_AGENCIES, [])
        expect(options.map(option => option.label).slice(0, 3)).toEqual([
            `Denver city 4.81% · ${DENVER}`,
            `Denver lodging 8.875% · ${DENVER}`,
            `Adams County 0.75% · ${COLORADO}`,
        ])
        expect(options).toEqual(ACTIVE_RATE_OPTIONS)
    })

    it('lists no group and no inactive rate', () => {
        const options = groupComponentOptions(TAX_RATE_ROWS, TAX_AGENCIES, [])
        const labels = options.map(option => option.label)
        for (const name of [
            'Denver combined',
            'Adams County combined',
            'Old combined',
            'Retired rate',
            'Old county rate',
        ]) {
            expect(labels.filter(label => label.startsWith(name))).toEqual([])
        }
        const values = options.map(option => option.value)
        for (const id of [
            TAX_IDS.denverCombined,
            TAX_IDS.adamsCombined,
            TAX_IDS.oldCombined,
            TAX_IDS.retired,
            TAX_IDS.oldCountyRate,
        ]) {
            expect(values).not.toContain(id)
        }
    })

    it("keeps a stored inactive rate, marked inactive, after Denver's active rates", () => {
        expect(groupComponentOptions(TAX_RATE_ROWS, TAX_AGENCIES, [TAX_IDS.retired])).toEqual([
            ACTIVE_RATE_OPTIONS[0],
            ACTIVE_RATE_OPTIONS[1],
            { value: TAX_IDS.retired, label: `Retired rate 3.5% · ${DENVER} (inactive)` },
            ...ACTIVE_RATE_OPTIONS.slice(2),
        ])
    })

    it('lists a stored active rate once, in its own place', () => {
        expect(
            groupComponentOptions(TAX_RATE_ROWS, TAX_AGENCIES, [TAX_IDS.state, TAX_IDS.lodging])
        ).toEqual(ACTIVE_RATE_OPTIONS)
    })
})

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
