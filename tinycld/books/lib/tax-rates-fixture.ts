// Synthetic sales tax data for the seed (seed.ts) and the helix reference route,
// which reads these names.
//
// books_tax_agencies and books_tax_rates do not exist yet. Until checkpoint 2
// (migration 2100000007, "Sales tax collections, guards and seed") creates them,
// the rows are typed against the local interfaces below, which mirror the spec's
// Data section. Checkpoint 2 deletes `TaxAgencyColumns`, `TaxRateColumns` and
// `CustomerTaxColumns` and types the rows with `satisfies` against the generated
// `BooksTaxAgencies`, `BooksTaxRates`, `BooksProducts` and `BooksCustomers`.
//
// Accounts are named by seed account number (lib/seed-accounts.ts gains
// 2200 Sales tax payable in checkpoint 2); the seed maps each number to the
// created account's id. Customers are named by their customer-form fixture id,
// which the seed maps to the created id. Ids of the tax rows are valid
// PocketBase ids (15 lowercase letters and digits), so the seed may send them.

import type { BooksAccounts } from '../types'
import { CUSTOMER_IDS } from './customer-form-fixture'
import { PRODUCTS } from './products-services-fixture'

// Local mirror of the spec's books_tax_agencies (checkpoint 2 replaces it).
// `name_key` and `sort_key` are the guard's and never in a fixture row.
interface TaxAgencyColumns {
    id: string
    name: string
    account: string
    inactive: boolean
    created: string
    updated: string
}

// Local mirror of the spec's books_tax_rates (checkpoint 2 replaces it).
interface TaxRateColumns {
    id: string
    type: 'rate' | 'group'
    name: string
    rate_ppm: number
    agency: string
    components: string[]
    is_default: boolean
    inactive: boolean
    created: string
    updated: string
}

// Local mirror of the spec's new books_customers columns (checkpoint 2 replaces it).
type ExemptionReasonKey =
    | 'resale'
    | 'federal_government'
    | 'state_local_government'
    | 'tribal_government'
    | 'nonprofit'
    | 'educational'
    | 'agricultural'
    | 'manufacturing'
    | 'direct_pay'
    | 'other'

interface CustomerTaxColumns {
    tax_exempt: boolean
    exemption_reason: ExemptionReasonKey | ''
    exemption_number: string
    default_tax_rate: string
}

// The relation column holds an id the seed only knows after it creates the
// account, so the fixture names the account by number.
export type TaxAgencyFixtureRecord = Omit<TaxAgencyColumns, 'account'> & {
    account_number: string
}

export type TaxRateFixtureRecord = TaxRateColumns

// The liability account every seeded agency names. Checkpoint 2 adds it to
// SEED_ACCOUNTS; the reference route reads it from here until then.
export const SALES_TAX_ACCOUNT = {
    key: 'sales-tax',
    name: 'Sales tax payable',
    number: '2200',
    type: 'other_current_liability',
    detail_type: 'sales_tax_payable',
} satisfies {
    key: string
    name: string
    number: string
    type: BooksAccounts['type']
    detail_type: string
}

const STAMP = '2026-01-01 00:00:00.000Z'

export const TAX_IDS = {
    // Agencies.
    colorado: 'taxagcolorado01',
    denver: 'taxagdenver0001',
    // Inactive, with one inactive rate: shows only while Show inactive is on.
    oldCounty: 'taxagoldcounty1',
    // Rates of Colorado Department of Revenue.
    state: 'taxrtcostate001',
    rtd: 'taxrtrtd0000001',
    adams: 'taxrtadams00001',
    // A 0% rate (zero-rated sales).
    foodExempt: 'taxrtfoodexmpt1',
    // A name long enough to truncate in a row and wrap on a phone.
    culturalDistrict: 'taxrtscfd000001',
    // Rates of City and County of Denver.
    denverCity: 'taxrtdenvercty1',
    // 8.875%: a rate with more decimals than cents show (up to four are allowed).
    lodging: 'taxrtlodging001',
    // Inactive, in no group.
    retired: 'taxrtretired001',
    // The inactive agency's rate, inactive too.
    oldCountyRate: 'taxrtoldcounty1',
    // Groups.
    denverCombined: 'taxgpdenvercmb1',
    adamsCombined: 'taxgpadamscmb01',
    // Inactive group of active rates.
    oldCombined: 'taxgpoldcmb0001',
} as const

function agency(
    row: Pick<TaxAgencyFixtureRecord, 'id' | 'name'> & Partial<TaxAgencyFixtureRecord>
) {
    return {
        account_number: SALES_TAX_ACCOUNT.number,
        inactive: false,
        created: STAMP,
        updated: STAMP,
        ...row,
    } satisfies TaxAgencyFixtureRecord
}

function rate(
    row: Pick<TaxRateFixtureRecord, 'id' | 'name' | 'rate_ppm' | 'agency'> &
        Partial<TaxRateFixtureRecord>
): TaxRateFixtureRecord {
    return {
        type: 'rate',
        components: [],
        is_default: false,
        inactive: false,
        created: STAMP,
        updated: STAMP,
        ...row,
    }
}

function group(
    row: Pick<TaxRateFixtureRecord, 'id' | 'name' | 'components'> & Partial<TaxRateFixtureRecord>
): TaxRateFixtureRecord {
    return {
        type: 'group',
        rate_ppm: 0,
        agency: '',
        is_default: false,
        inactive: false,
        created: STAMP,
        updated: STAMP,
        ...row,
    }
}

export const TAX_AGENCIES: TaxAgencyFixtureRecord[] = [
    agency({ id: TAX_IDS.colorado, name: 'Colorado Department of Revenue' }),
    agency({ id: TAX_IDS.denver, name: 'City and County of Denver' }),
    agency({ id: TAX_IDS.oldCounty, name: 'Old county agency', inactive: true }),
]

// Rates in parts per million of the taxable amount: 1% = 10 000.
export const TAX_RATES: TaxRateFixtureRecord[] = [
    rate({ id: TAX_IDS.state, name: 'Colorado state', rate_ppm: 29_000, agency: TAX_IDS.colorado }),
    rate({ id: TAX_IDS.rtd, name: 'RTD transit', rate_ppm: 10_000, agency: TAX_IDS.colorado }),
    rate({ id: TAX_IDS.adams, name: 'Adams County', rate_ppm: 7_500, agency: TAX_IDS.colorado }),
    rate({
        id: TAX_IDS.foodExempt,
        name: 'Exempt food sales (state)',
        rate_ppm: 0,
        agency: TAX_IDS.colorado,
    }),
    rate({
        id: TAX_IDS.culturalDistrict,
        name: 'Scientific and Cultural Facilities District, seven-county Denver metro area',
        // 0.105%: with Denver lodging (8.875%) a group's tax on $100.00 is $8.99 when each
        // rate is rounded first and $8.98 when the rates are added first.
        rate_ppm: 1_050,
        agency: TAX_IDS.colorado,
    }),
    rate({ id: TAX_IDS.denverCity, name: 'Denver city', rate_ppm: 48_100, agency: TAX_IDS.denver }),
    rate({ id: TAX_IDS.lodging, name: 'Denver lodging', rate_ppm: 88_750, agency: TAX_IDS.denver }),
    rate({
        id: TAX_IDS.retired,
        name: 'Retired rate',
        rate_ppm: 35_000,
        agency: TAX_IDS.denver,
        inactive: true,
    }),
    rate({
        id: TAX_IDS.oldCountyRate,
        name: 'Old county rate',
        rate_ppm: 12_500,
        agency: TAX_IDS.oldCounty,
        inactive: true,
    }),
]

export const TAX_GROUPS: TaxRateFixtureRecord[] = [
    group({
        id: TAX_IDS.denverCombined,
        name: 'Denver combined',
        components: [TAX_IDS.state, TAX_IDS.rtd, TAX_IDS.denverCity],
        is_default: true,
    }),
    group({
        id: TAX_IDS.adamsCombined,
        name: 'Adams County combined',
        components: [TAX_IDS.state, TAX_IDS.adams],
    }),
    group({
        id: TAX_IDS.oldCombined,
        name: 'Old combined',
        components: [TAX_IDS.state, TAX_IDS.rtd],
        inactive: true,
    }),
]

// Every books_tax_rates row the seed writes, rates before the groups that name them.
export const TAX_RATE_ROWS: TaxRateFixtureRecord[] = [...TAX_RATES, ...TAX_GROUPS]

// A component that is not a seeded rate is a fixture bug, not data.
for (const row of TAX_GROUPS) {
    for (const id of row.components) {
        if (!TAX_RATES.some(r => r.id === id && !r.inactive)) {
            throw new Error(`tax fixture: group ${row.id} names ${id}, not an active seeded rate`)
        }
    }
}

// Products the seed marks taxable: every Non-inventory item. Services and
// bundles stay not taxable (spec: a new Service starts not taxable; a bundle has
// no setting of its own).
export const TAXABLE_PRODUCT_IDS: string[] = PRODUCTS.filter(p => p.type === 'non_inventory').map(
    p => p.id
)

// The tax columns the seed writes on two customers, by customer-form fixture id;
// every other customer keeps the empty values.
export const CUSTOMER_TAX_PATCHES = [
    {
        id: CUSTOMER_IDS.northwind,
        tax_exempt: true,
        exemption_reason: 'resale',
        exemption_number: 'CO-98-01234-0000',
        default_tax_rate: '',
    },
    {
        id: CUSTOMER_IDS.harborview,
        tax_exempt: false,
        exemption_reason: '',
        exemption_number: '',
        default_tax_rate: TAX_IDS.denverCombined,
    },
] satisfies ({ id: string } & CustomerTaxColumns)[]

// No agency at all: the page's empty state.
export const EMPTY_TAX_AGENCIES: TaxAgencyFixtureRecord[] = []
export const EMPTY_TAX_RATES: TaxRateFixtureRecord[] = []

// A chart with no active Other current liability account: the Add agency
// dialog's one-tap account create.
export const NO_LIABILITY_ACCOUNTS: (typeof SALES_TAX_ACCOUNT)[] = []
