// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { selectSections } from '@tinycld/core/ui/form/select-sections'
import { describe, expect, it, vi } from 'vitest'
import type { AgencyWithRates, GroupRow } from '../tinycld/books/hooks/useTaxesScreen'
import { useTaxRateOptions } from '../tinycld/books/hooks/useTaxRateOptions'
import {
    groupComponentOptions,
    rateAgencyOptions,
    type TaxOptionRate,
    taxOptionRows,
    taxRateOptions,
} from '../tinycld/books/lib/tax-rate-options'
import {
    TAX_AGENCIES,
    TAX_GROUPS,
    TAX_IDS,
    TAX_RATE_ROWS,
    TAX_RATES,
    type TaxRateFixtureRecord,
} from '../tinycld/books/lib/tax-rates-fixture'
import type { BooksTaxAgencies, BooksTaxRates } from '../tinycld/books/types'
import { seedBooks, taxRatesStore } from './accounts-form-harness'
import { publishedRow } from './live-rows'
import { expectLiveQueryError } from './silence-log'

// Only the useTaxRateOptions test reads collections: the harness serves `useStore` from
// real local-only collections. The other tests are pure.
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

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

// A fixture row as the books_tax_rates collection stores it.
function rateColumns(row: TaxRateFixtureRecord): BooksTaxRates {
    return { ...row, name_key: row.name.toLowerCase(), sort_key: row.name.toLowerCase() }
}

// A fixture agency as the books_tax_agencies collection stores it.
function agencyColumns(agency: (typeof TAX_AGENCIES)[number]): BooksTaxAgencies {
    return {
        id: agency.id,
        name: agency.name,
        account: 'acct2200salestx',
        inactive: agency.inactive,
        name_key: agency.name.toLowerCase(),
        sort_key: agency.name.toLowerCase(),
        created: agency.created,
        updated: agency.updated,
    }
}

function rateQueryRow(row: TaxRateFixtureRecord) {
    return publishedRow(rateColumns(row), 'books_tax_rates')
}

// The page's two live queries as they publish their rows: each agency with its rates
// materialized in `rates` (the liability account is not read here), and the groups.
function agencyQueryRows(): AgencyWithRates[] {
    return TAX_AGENCIES.map(agency => {
        const rates = TAX_RATES.filter(rate => rate.agency === agency.id).map(rateQueryRow)
        return publishedRow(
            { ...agencyColumns(agency), rates, liability: undefined },
            'books_tax_agencies'
        )
    })
}

function groupQueryRows(): GroupRow[] {
    return TAX_GROUPS.map(rateQueryRow)
}

// A row cut down to the columns the pickers read.
function optionColumns(row: TaxOptionRate) {
    const { id, name, type, rate_ppm, agency, components, inactive } = row
    return { id, name, type, rate_ppm, agency, components, inactive }
}

function byId<T extends { id: string }>(rows: readonly T[]) {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

describe('taxOptionRows', () => {
    it('holds every rate (inactive ones included) and every group once, rates first', () => {
        const rows = taxOptionRows(agencyQueryRows(), groupQueryRows())

        expect(rows).toHaveLength(TAX_RATE_ROWS.length)
        expect(new Set(rows.map(row => row.id)).size).toBe(TAX_RATE_ROWS.length)
        expect(byId(rows)).toEqual(byId(TAX_RATE_ROWS.map(optionColumns)))
        const types = rows.map(row => row.type)
        expect(types.slice(0, TAX_RATES.length).every(type => type === 'rate')).toBe(true)
        expect(types.slice(TAX_RATES.length).every(type => type === 'group')).toBe(true)
    })

    it('keeps only the picker columns of each row', () => {
        const rows = taxOptionRows(agencyQueryRows(), groupQueryRows())
        for (const row of rows) {
            expect(Object.keys(row).sort()).toEqual([
                'agency',
                'components',
                'id',
                'inactive',
                'name',
                'rate_ppm',
                'type',
            ])
        }
    })
})

const DENVER_SECTION = [
    { value: TAX_IDS.denverCity, label: 'Denver city 4.81%', section: DENVER },
    { value: TAX_IDS.lodging, label: 'Denver lodging 8.875%', section: DENVER },
]

const COLORADO_SECTION = [
    { value: TAX_IDS.adams, label: 'Adams County 0.75%', section: COLORADO },
    { value: TAX_IDS.state, label: 'Colorado state 2.9%', section: COLORADO },
    { value: TAX_IDS.foodExempt, label: 'Exempt food sales (state) 0%', section: COLORADO },
    { value: TAX_IDS.rtd, label: 'RTD transit 1%', section: COLORADO },
    {
        value: TAX_IDS.culturalDistrict,
        label: 'Scientific and Cultural Facilities District, seven-county Denver metro area 0.105%',
        section: COLORADO,
    },
]

const GROUPS_SECTION = [
    { value: TAX_IDS.adamsCombined, label: 'Adams County combined 3.65%', section: 'Groups' },
    { value: TAX_IDS.denverCombined, label: 'Denver combined 8.71%', section: 'Groups' },
]

describe('taxRateOptions', () => {
    it('starts with None, then the active rates under their agency, then the active groups', () => {
        const options = taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.denverCombined)

        expect(options[0]).toEqual({ value: '', label: 'None' })
        expect(options[0].section).toBeUndefined()
        expect(options).toEqual([
            { value: '', label: 'None' },
            ...DENVER_SECTION,
            ...COLORADO_SECTION,
            ...GROUPS_SECTION,
        ])
    })

    it('offers no inactive rate or group', () => {
        const options = taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.denverCombined)
        const labels = options.map(option => option.label)
        for (const name of ['Old combined', 'Old county rate', 'Retired rate']) {
            expect(labels.filter(label => label.startsWith(name))).toEqual([])
        }
        const values = options.map(option => option.value)
        for (const id of [TAX_IDS.oldCombined, TAX_IDS.oldCountyRate, TAX_IDS.retired]) {
            expect(values).not.toContain(id)
        }
    })

    it('lists a stored inactive rate under its agency, marked inactive', () => {
        expect(taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.retired)).toEqual([
            { value: '', label: 'None' },
            ...DENVER_SECTION,
            { value: TAX_IDS.retired, label: 'Retired rate 3.5% (inactive)', section: DENVER },
            ...COLORADO_SECTION,
            ...GROUPS_SECTION,
        ])
    })

    it('lists a stored inactive group under Groups with its combined percent, marked inactive', () => {
        expect(taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.oldCombined)).toEqual([
            { value: '', label: 'None' },
            ...DENVER_SECTION,
            ...COLORADO_SECTION,
            ...GROUPS_SECTION,
            {
                value: TAX_IDS.oldCombined,
                label: 'Old combined 3.9% (inactive)',
                section: 'Groups',
            },
        ])
    })

    it('splits into the runs None, City and County of Denver, Colorado Department of Revenue, Groups', () => {
        const runs = selectSections(
            taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.denverCombined)
        )
        expect(runs.map(run => run.label)).toEqual([null, DENVER, COLORADO, 'Groups'])
    })
})

// The customer form's Default sales tax reads the rates, each with its agency
// materialized, through useTaxRateOptions; the page's default picker reads the agencies
// with their rates materialized. Both must offer the same choices, a stored inactive one too.
describe('useTaxRateOptions', () => {
    const STORED = [
        '',
        TAX_IDS.denverCombined,
        TAX_IDS.adamsCombined,
        TAX_IDS.retired,
        TAX_IDS.oldCombined,
    ]

    it('gives the customer field the same options as the default picker, inactive choices included', async () => {
        seedBooks({
            taxAgencies: TAX_AGENCIES.map(agencyColumns),
            taxRates: TAX_RATE_ROWS.map(rateColumns),
        })
        const { result } = renderHook(() => useTaxRateOptions())
        await waitFor(() => expect(result.current.isReady).toBe(true))
        const { rows, agencies } = result.current

        const picker = taxOptionRows(agencyQueryRows(), groupQueryRows())
        for (const stored of STORED) {
            const field = taxRateOptions(rows, agencies, stored)
            expect(field, stored).toEqual(taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, stored))
            expect(field, stored).toEqual(taxRateOptions(picker, TAX_AGENCIES, stored))
        }
    })

    it('reports a refused rates load, and retry loads the rows', async () => {
        seedBooks({
            taxAgencies: TAX_AGENCIES.map(agencyColumns),
            taxRates: TAX_RATE_ROWS.map(rateColumns),
            taxRatesFailsOnce: true,
        })
        expectLiveQueryError(taxRatesStore().id)
        const { result } = renderHook(() => useTaxRateOptions())

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.rows).toEqual([])

        act(() => result.current.retry())

        await waitFor(() => expect(result.current.isError).toBe(false))
        await waitFor(() => expect(result.current.isReady).toBe(true))
        await waitFor(() => expect(result.current.rows).toHaveLength(TAX_RATE_ROWS.length))
        const { rows, agencies } = result.current
        expect(byId(rows.map(optionColumns))).toEqual(byId(TAX_RATE_ROWS.map(optionColumns)))
        expect(taxRateOptions(rows, agencies, TAX_IDS.retired)).toEqual(
            taxRateOptions(TAX_RATE_ROWS, TAX_AGENCIES, TAX_IDS.retired)
        )
    })
})
