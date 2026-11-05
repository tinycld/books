// Synthetic sales tax data for the seed (seed.ts) and the helix reference route,
// which reads these names.
//
// The rows are typed against the generated `BooksTaxAgencies`, `BooksTaxRates`
// and `BooksCustomers` (migration 2100000007), so tsc checks every column
// against the schema. A row never carries `name_key` (hidden, so a live query
// never receives it) or `sort_key`: the server's guard sets both on every write.
//
// Accounts are named by seed account number (lib/seed-accounts.ts); the seed
// maps each number to the created account's id. Customers are named by their
// customer-form fixture id, which the seed maps to the created id. Ids of the
// tax rows are valid PocketBase ids (15 lowercase letters and digits), so the
// seed may send them.

import type { BooksCustomers, BooksTaxAgencies, BooksTaxRates } from '../types'
import { CUSTOMER_IDS } from './customer-form-fixture'
import type { ColumnOf } from './fixture-columns'
import { SEED_ACCOUNTS } from './seed-accounts'

// The relation column holds an id the seed only knows after it creates the
// account, so the fixture names the account by number.
export type TaxAgencyFixtureRecord = Omit<
    BooksTaxAgencies,
    ColumnOf<BooksTaxAgencies, 'name_key' | 'sort_key' | 'account'>
> & {
    account_number: string
}

export type TaxRateFixtureRecord = Omit<
    BooksTaxRates,
    ColumnOf<BooksTaxRates, 'name_key' | 'sort_key'>
>

function salesTaxAccount() {
    const account = SEED_ACCOUNTS.find(a => a.key === 'sales-tax')
    if (!account) throw new Error('tax fixture: SEED_ACCOUNTS has no sales-tax account')
    return account
}

// The liability account every seeded agency names: 2200 Sales tax payable.
export const SALES_TAX_ACCOUNT = salesTaxAccount()

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
] satisfies ({ id: string } & Pick<
    BooksCustomers,
    ColumnOf<
        BooksCustomers,
        'tax_exempt' | 'exemption_reason' | 'exemption_number' | 'default_tax_rate'
    >
>)[]

// No agency at all: the page's empty state.
export const EMPTY_TAX_AGENCIES: TaxAgencyFixtureRecord[] = []
export const EMPTY_TAX_RATES: TaxRateFixtureRecord[] = []

// A chart with no active Other current liability account: the Add agency
// dialog's one-tap account create.
export const NO_LIABILITY_ACCOUNTS: (typeof SALES_TAX_ACCOUNT)[] = []
