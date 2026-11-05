import { describe, expect, it } from 'vitest'
import type { AgencyWithRates, GroupRow } from '../tinycld/books/hooks/useTaxesScreen'
import {
    TAX_AGENCIES,
    TAX_GROUPS,
    TAX_IDS,
    TAX_RATES,
    type TaxAgencyFixtureRecord,
    type TaxRateFixtureRecord,
} from '../tinycld/books/lib/tax-rates-fixture'
import {
    buildTaxesView,
    compareNames,
    emptyState,
    type TaxesView,
    type TaxRowView,
    taxesControls,
} from '../tinycld/books/lib/taxes-view'
import type { BooksAccounts, BooksTaxAgencies, BooksTaxRates } from '../tinycld/books/types'
import { publishedRow } from './live-rows'

// The page's two live queries, built from the sales tax fixture: agencies, each with its
// rates materialized in a `rates` array and its liability account materialized in
// `liability`, and the groups. The fixture names the liability account by number; the
// query row holds the account's id and the materialized accounts row.

const ACCOUNT_2200 = 'acct2200salestx'
const LATER = '2026-02-01 00:00:00.000Z'

// The accounts row the agencies query materializes for 2200 Sales tax payable.
function liabilityRow() {
    const columns = {
        id: ACCOUNT_2200,
        name: 'Sales tax payable',
        number: '2200',
        type: 'other_current_liability',
        detail_type: 'sales_tax_payable',
        description: '',
        inactive: false,
        currency: 'USD',
        form_1099_box: '',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        parent: '',
    } satisfies BooksAccounts
    return publishedRow(columns, 'books_accounts')
}

type Liability = ReturnType<typeof liabilityRow> | undefined

function rateRow(row: TaxRateFixtureRecord) {
    const columns = {
        ...row,
        name_key: row.name.toLowerCase(),
        sort_key: row.name.toLowerCase(),
    } satisfies BooksTaxRates
    return publishedRow(columns, 'books_tax_rates')
}

function agencyRow(
    agency: TaxAgencyFixtureRecord,
    rates: readonly TaxRateFixtureRecord[],
    liability: Liability
): AgencyWithRates {
    const columns = {
        id: agency.id,
        name: agency.name,
        account: ACCOUNT_2200,
        inactive: agency.inactive,
        name_key: agency.name.toLowerCase(),
        sort_key: agency.name.toLowerCase(),
        created: agency.created,
        updated: agency.updated,
    } satisfies BooksTaxAgencies
    return publishedRow(
        {
            ...columns,
            rates: rates.filter(rate => rate.agency === agency.id).map(rateRow),
            liability,
        },
        'books_tax_agencies'
    )
}

function agencyRows(
    agencies: readonly TaxAgencyFixtureRecord[] = TAX_AGENCIES,
    rates: readonly TaxRateFixtureRecord[] = TAX_RATES,
    liability: Liability = liabilityRow()
): AgencyWithRates[] {
    return agencies.map(agency => agencyRow(agency, rates, liability))
}

function groupRows(groups: readonly TaxRateFixtureRecord[] = TAX_GROUPS): GroupRow[] {
    return groups.map(rateRow)
}

function fixtureAgency(id: string) {
    const agency = TAX_AGENCIES.find(row => row.id === id)
    if (!agency) throw new Error(`no fixture agency ${id}`)
    return agency
}

function fixtureRate(id: string) {
    const rate = TAX_RATES.find(row => row.id === id)
    if (!rate) throw new Error(`no fixture rate ${id}`)
    return rate
}

function build(
    input: Partial<{
        agencies: AgencyWithRates[]
        groups: GroupRow[]
        showInactive: boolean
        pendingDefaultId: string | null
    }> = {}
): TaxesView {
    return buildTaxesView({
        agencies: agencyRows(),
        groups: groupRows(),
        showInactive: false,
        pendingDefaultId: null,
        ...input,
    })
}

function card(view: TaxesView, name: string) {
    const found = view.agencies.find(agency => agency.name === name)
    if (!found) throw new Error(`no agency card ${name}`)
    return found
}

function group(view: TaxesView, name: string) {
    const found = view.groups.find(row => row.name === name)
    if (!found) throw new Error(`no group row ${name}`)
    return found
}

function allRows(view: TaxesView): TaxRowView[] {
    return [...view.agencies.flatMap(agency => agency.rates), ...view.groups]
}

function caseless(names: readonly string[]) {
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

describe('buildTaxesView with Show inactive off', () => {
    const view = build()

    it('lists the active agencies in caseless name order', () => {
        expect(view.agencies.map(agency => agency.name)).toEqual([
            'City and County of Denver',
            'Colorado Department of Revenue',
        ])
    })

    it("lists Colorado's rates in name order with their percents, 0% and 0.105% included", () => {
        const colorado = card(view, 'Colorado Department of Revenue')
        const names = colorado.rates.map(rate => rate.name)
        expect(names).toEqual(caseless(names))
        expect(names).toEqual([
            'Adams County',
            'Colorado state',
            'Exempt food sales (state)',
            'RTD transit',
            'Scientific and Cultural Facilities District, seven-county Denver metro area',
        ])
        const percents = colorado.rates.map(rate => rate.percent)
        expect(percents).toContain('0%')
        expect(percents).toContain('0.105%')
        expect(colorado.rates.every(rate => rate.kind === 'rate' && rate.components === '')).toBe(
            true
        )
    })

    it("lists Denver's active rates only: Denver city 4.81% and Denver lodging 8.875%", () => {
        const denver = card(view, 'City and County of Denver')
        expect(denver.rates.map(rate => [rate.name, rate.percent])).toEqual([
            ['Denver city', '4.81%'],
            ['Denver lodging', '8.875%'],
        ])
    })

    it('writes the account line from the materialized liability account', () => {
        expect(card(view, 'Colorado Department of Revenue').accountLine).toBe(
            'Tax goes to 2200 Sales tax payable'
        )
        expect(card(view, 'City and County of Denver').accountLine).toBe(
            'Tax goes to 2200 Sales tax payable'
        )
    })

    it('lists the active groups with their combined percent and rates in rate-name order', () => {
        expect(view.groups.map(row => row.name)).toEqual([
            'Adams County combined',
            'Denver combined',
        ])
        const adams = group(view, 'Adams County combined')
        expect(adams.kind).toBe('group')
        expect(adams.percent).toBe('3.65%')
        expect(adams.components).toBe('Adams County 0.75% + Colorado state 2.9%')
        expect(adams.isDefault).toBe(false)
        const denver = group(view, 'Denver combined')
        expect(denver.percent).toBe('8.71%')
        expect(denver.components).toBe('Colorado state 2.9% + Denver city 4.81% + RTD transit 1%')
        expect(denver.isDefault).toBe(true)
    })

    it('takes the stored default as the default row, the only row marked default', () => {
        expect(view.defaultRow?.name).toBe('Denver combined')
        expect(view.defaultRow?.id).toBe(TAX_IDS.denverCombined)
        expect(
            allRows(view)
                .filter(row => row.isDefault)
                .map(row => row.id)
        ).toEqual([TAX_IDS.denverCombined])
    })

    it('counts the seven active rates and shows the default card with no groups hint', () => {
        expect(view.activeRateCount).toBe(7)
        expect(view.showDefaultCard).toBe(true)
        expect(view.groupsHint).toBeNull()
        expect(view.isEmpty).toBe(false)
    })

    it('marks no shown row or card inactive', () => {
        expect(view.agencies.some(agency => agency.inactive)).toBe(false)
        expect(allRows(view).some(row => row.inactive)).toBe(false)
    })
})

describe('buildTaxesView with Show inactive on', () => {
    const view = build({ showInactive: true })

    it('lists Old county agency in name order, inactive, with its inactive rate at 1.25%', () => {
        expect(view.agencies.map(agency => agency.name)).toEqual([
            'City and County of Denver',
            'Colorado Department of Revenue',
            'Old county agency',
        ])
        const old = card(view, 'Old county agency')
        expect(old.inactive).toBe(true)
        expect(old.rates.map(rate => [rate.name, rate.inactive, rate.percent])).toEqual([
            ['Old county rate', true, '1.25%'],
        ])
    })

    it("lists Retired rate among Denver's rates, inactive", () => {
        const denver = card(view, 'City and County of Denver')
        expect(denver.inactive).toBe(false)
        expect(denver.rates.map(rate => [rate.name, rate.inactive])).toEqual([
            ['Denver city', false],
            ['Denver lodging', false],
            ['Retired rate', true],
        ])
    })

    it('lists Old combined among the groups, inactive, at 3.9%', () => {
        expect(view.groups.map(row => row.name)).toEqual([
            'Adams County combined',
            'Denver combined',
            'Old combined',
        ])
        const old = group(view, 'Old combined')
        expect(old.inactive).toBe(true)
        expect(old.percent).toBe('3.9%')
    })

    it('still counts seven active rates', () => {
        expect(view.activeRateCount).toBe(7)
    })
})

describe('buildTaxesView edge rows', () => {
    it("writes 'Tax goes to' alone for an agency whose liability account is missing", () => {
        const view = build({
            agencies: TAX_AGENCIES.map(agency => agencyRow(agency, TAX_RATES, undefined)),
        })
        expect(view.agencies.map(agency => agency.name)).toEqual([
            'City and County of Denver',
            'Colorado Department of Revenue',
        ])
        for (const agency of view.agencies) {
            expect(agency.accountLine).toBe('Tax goes to')
            expect(agency.accountLine).not.toContain('undefined')
        }
    })

    it('marks an active agency whose rates are all inactive as having rates', () => {
        const agencies = agencyRows([fixtureAgency(TAX_IDS.denver)], [fixtureRate(TAX_IDS.retired)])
        const hidden = card(build({ agencies, groups: [] }), 'City and County of Denver')
        expect(hidden.hasRates).toBe(true)
        expect(hidden.rates).toEqual([])
        const shown = card(
            build({ agencies, groups: [], showInactive: true }),
            'City and County of Denver'
        )
        expect(shown.hasRates).toBe(true)
        expect(shown.rates.map(rate => [rate.name, rate.inactive])).toEqual([
            ['Retired rate', true],
        ])
    })

    it('marks an agency with no rate at all as having none, Show inactive on or off', () => {
        const agencies = agencyRows([fixtureAgency(TAX_IDS.colorado)], [])
        for (const showInactive of [false, true]) {
            const colorado = card(
                build({ agencies, groups: [], showInactive }),
                'Colorado Department of Revenue'
            )
            expect(colorado.hasRates).toBe(false)
            expect(colorado.rates).toEqual([])
        }
    })

    it('marks the fixture agencies with rates as having rates', () => {
        const view = build({ showInactive: true })
        expect(view.agencies.map(agency => [agency.name, agency.hasRates])).toEqual([
            ['City and County of Denver', true],
            ['Colorado Department of Revenue', true],
            ['Old county agency', true],
        ])
    })

    it('lists only the components of a group it finds among the rates', () => {
        const coloradoOnly = agencyRows([fixtureAgency(TAX_IDS.colorado)])
        const view = build({ agencies: coloradoOnly })
        const denver = group(view, 'Denver combined')
        expect(denver.components).toBe('Colorado state 2.9% + RTD transit 1%')
        expect(denver.percent).toBe('3.9%')
    })

    it('is empty with no agency at all, and then shows no default card', () => {
        const view = build({ agencies: [], groups: [] })
        expect(view.isEmpty).toBe(true)
        expect(view.showDefaultCard).toBe(false)
        expect(view.activeRateCount).toBe(0)
        expect(view.agencies).toEqual([])
    })

    it('is not empty while only an inactive agency exists, even with it hidden', () => {
        const view = build({ agencies: agencyRows([fixtureAgency(TAX_IDS.oldCounty)]) })
        expect(view.agencies).toEqual([])
        expect(view.isEmpty).toBe(false)
    })

    it('with one active rate shows the default card and the groups hint', () => {
        const view = build({
            agencies: agencyRows([fixtureAgency(TAX_IDS.colorado)], [fixtureRate(TAX_IDS.state)]),
            groups: [],
        })
        expect(view.activeRateCount).toBe(1)
        expect(view.showDefaultCard).toBe(true)
        expect(view.groupsHint).toBe('Add at least two rates to combine them.')
    })

    it('keeps names that differ only in case in a stable order by id', () => {
        const lower = { ...fixtureAgency(TAX_IDS.colorado), id: 'taxagsamecase01', name: 'tax' }
        const upper = { ...fixtureAgency(TAX_IDS.denver), id: 'taxagsamecase02', name: 'Tax' }
        const forward = build({ agencies: agencyRows([lower, upper], []), groups: [] })
        const backward = build({ agencies: agencyRows([upper, lower], []), groups: [] })
        expect(forward.agencies.map(agency => agency.id)).toEqual([
            'taxagsamecase01',
            'taxagsamecase02',
        ])
        expect(backward.agencies.map(agency => agency.id)).toEqual([
            'taxagsamecase01',
            'taxagsamecase02',
        ])
    })
})

describe('compareNames', () => {
    it('ignores case and orders a tie by id', () => {
        expect(compareNames({ name: 'apple', id: 'b' }, { name: 'Banana', id: 'a' })).toBeLessThan(
            0
        )
        expect(compareNames({ name: 'Tax', id: 'b' }, { name: 'tax', id: 'a' })).toBeGreaterThan(0)
        expect(compareNames({ name: 'tax', id: 'a' }, { name: 'Tax', id: 'b' })).toBeLessThan(0)
        expect(compareNames({ name: 'tax', id: 'a' }, { name: 'tax', id: 'a' })).toBe(0)
    })
})

describe('buildTaxesView default row', () => {
    it('takes a pending default as the default while its write runs', () => {
        const view = build({ pendingDefaultId: TAX_IDS.state })
        expect(view.defaultRow?.id).toBe(TAX_IDS.state)
        const state = card(view, 'Colorado Department of Revenue').rates.find(
            rate => rate.id === TAX_IDS.state
        )
        expect(state?.name).toBe('Colorado state')
        expect(state?.isDefault).toBe(true)
        expect(group(view, 'Denver combined').isDefault).toBe(false)
        expect(
            allRows(view)
                .filter(row => row.isDefault)
                .map(row => row.id)
        ).toEqual([TAX_IDS.state])
    })

    it('has no default while a Remove default write runs', () => {
        const view = build({ pendingDefaultId: '' })
        expect(view.defaultRow).toBeNull()
        expect(allRows(view).some(row => row.isDefault)).toBe(false)
    })

    it('takes the latest updated of two rows flagged default, and marks only it', () => {
        const groups = TAX_GROUPS.map(row =>
            row.id === TAX_IDS.adamsCombined ? { ...row, is_default: true, updated: LATER } : row
        )
        const view = build({ groups: groupRows(groups) })
        expect(view.defaultRow?.name).toBe('Adams County combined')
        expect(group(view, 'Adams County combined').isDefault).toBe(true)
        expect(group(view, 'Denver combined').isDefault).toBe(false)
        expect(
            allRows(view)
                .filter(row => row.isDefault)
                .map(row => row.id)
        ).toEqual([TAX_IDS.adamsCombined])
    })
})

describe('taxesControls', () => {
    it.each([
        [true, true, { showActions: true, canPressWrites: true, showMenus: true }],
        [true, false, { showActions: true, canPressWrites: false, showMenus: true }],
        [false, true, { showActions: false, canPressWrites: false, showMenus: false }],
        [false, false, { showActions: false, canPressWrites: false, showMenus: false }],
    ])('canWrite %s, writes available %s', (canWrite, writesAvailable, expected) => {
        expect(taxesControls(canWrite, writesAvailable)).toEqual(expected)
    })
})

describe('emptyState', () => {
    it('asks a writer which agencies they collect for and offers Add agency', () => {
        expect(emptyState(true)).toEqual({
            title: 'Which agencies do you collect sales tax for?',
            hint: 'Add each state, county or city agency you file sales tax with. Then add the rates it charges.',
            showAddAgency: true,
        })
    })

    it('tells a reader no sales tax is set up, with no hint and no Add agency', () => {
        expect(emptyState(false)).toEqual({
            title: 'No sales tax is set up yet.',
            hint: null,
            showAddAgency: false,
        })
    })
})
