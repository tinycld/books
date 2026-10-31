// Synthetic customers for the seed (seed.ts) and the helix reference route,
// typed against the generated `BooksCustomers`. tsc checks each column's name
// against the real schema, and the type of every column except the JSON ones
// (billing_address, shipping_address, fields): the generated type holds those
// as `any`, so their shape here is the fixture's own. The server's guard
// checks the address shape when the seed sends the addresses; the seed does
// not send `fields`.

import type { BooksCustomers } from '../types'
import type { CustomerAddress } from './address'
import type { ColumnOf } from './fixture-columns'

export type { CustomerAddress } from './address'

type JsonColumn = ColumnOf<BooksCustomers, 'billing_address' | 'shipping_address' | 'fields'>
type ServerOnlyColumn = ColumnOf<BooksCustomers, 'name_key' | 'sort_key'>

// The generated type holds JSON columns as `any`, which would reach every
// reader of a fixture row untyped. The fixture row keeps them typed and is
// still assignable to `BooksCustomers` without `name_key` and `sort_key`. A
// null shipping_address means "same as billing address". The row never
// carries `name_key` (hidden, so a non-superuser never receives it) or
// `sort_key`: the server's guard sets both on every write.
export type CustomerFixtureRecord = Omit<BooksCustomers, JsonColumn | ServerOnlyColumn> & {
    billing_address: CustomerAddress | null
    shipping_address: CustomerAddress | null
    fields: Record<string, unknown> | null
}

type CustomerSeed = Pick<CustomerFixtureRecord, 'id' | 'display_name'> &
    Partial<Omit<CustomerFixtureRecord, 'id' | 'display_name'>>

function customer(seed: CustomerSeed): CustomerFixtureRecord {
    return {
        company: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        website: '',
        parent: '',
        billing_address: null,
        shipping_address: null,
        notes: '',
        inactive: false,
        form: '',
        fields: null,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...seed,
    }
}

function address(
    line1: string,
    city: string,
    region: string,
    postal_code: string,
    line2 = '',
    country = 'United States'
): CustomerAddress {
    return { line1, line2, city, region, postal_code, country }
}

export const CUSTOMER_IDS = {
    // Parent with two sub-customers; shipping equals billing.
    harborview: 'cust_harbor_001',
    harborviewKitchen: 'cust_harbor_002',
    harborviewEvents: 'cust_harbor_003',
    // Parent with three sub-customers, one of them inactive.
    northwind: 'cust_nwind_0001',
    northwindSeattle: 'cust_nwind_0002',
    northwindPortland: 'cust_nwind_0003',
    northwindBoise: 'cust_nwind_0004',
    // Parent with one sub-customer that ships somewhere else.
    alvarez: 'cust_alvar_0001',
    alvarezRemodel: 'cust_alvar_0002',
    // Parent with two sub-customers; long names.
    stJude: 'cust_stjud_0001',
    stJudeAnnex: 'cust_stjud_0002',
    stJudeGala: 'cust_stjud_0003',
    // Inactive top-level customer.
    oldMill: 'cust_oldml_0001',
} as const

const HARBORVIEW_BILLING = address('1450 Waterfront Avenue', 'Seattle', 'WA', '98101', 'Suite 300')

export const CUSTOMERS = [
    customer({
        id: CUSTOMER_IDS.harborview,
        display_name: 'Harborview Hospitality Group',
        company: 'Harborview Hospitality Group LLC',
        first_name: 'Dana',
        last_name: 'Whitfield',
        email: 'accounts.payable@harborviewhospitality.com',
        phone: '(206) 555-0142',
        mobile: '(206) 555-0199',
        website: 'https://harborviewhospitality.com',
        billing_address: HARBORVIEW_BILLING,
        shipping_address: null,
        notes: 'Net 30. Send invoices to the AP inbox, not to Dana directly.',
    }),
    customer({
        id: CUSTOMER_IDS.harborviewKitchen,
        display_name: 'Harborview Kitchen',
        company: 'Harborview Hospitality Group LLC',
        email: 'kitchen@harborviewhospitality.com',
        phone: '(206) 555-0143',
        parent: CUSTOMER_IDS.harborview,
        billing_address: HARBORVIEW_BILLING,
    }),
    customer({
        id: CUSTOMER_IDS.harborviewEvents,
        display_name: 'Harborview Events',
        company: 'Harborview Hospitality Group LLC',
        email: 'events@harborviewhospitality.com',
        phone: '(206) 555-0144',
        parent: CUSTOMER_IDS.harborview,
        billing_address: HARBORVIEW_BILLING,
    }),
    customer({
        id: CUSTOMER_IDS.northwind,
        display_name: 'Northwind Traders',
        company: 'Northwind Traders Inc.',
        first_name: 'Priya',
        last_name: 'Raman',
        email: 'billing@northwindtraders.example',
        phone: '(503) 555-0110',
        website: 'https://northwindtraders.example',
        billing_address: address('88 Industrial Parkway', 'Portland', 'OR', '97210'),
    }),
    customer({
        id: CUSTOMER_IDS.northwindSeattle,
        display_name: 'Northwind Seattle warehouse',
        company: 'Northwind Traders Inc.',
        email: 'seattle.receiving@northwindtraders.example',
        phone: '(206) 555-0177',
        parent: CUSTOMER_IDS.northwind,
        billing_address: address('88 Industrial Parkway', 'Portland', 'OR', '97210'),
        shipping_address: address(
            '4100 East Marginal Way South',
            'Seattle',
            'WA',
            '98134',
            'Dock 7'
        ),
    }),
    customer({
        id: CUSTOMER_IDS.northwindPortland,
        display_name: 'Northwind Portland store',
        company: 'Northwind Traders Inc.',
        phone: '(503) 555-0111',
        parent: CUSTOMER_IDS.northwind,
    }),
    customer({
        id: CUSTOMER_IDS.northwindBoise,
        display_name: 'Northwind Boise (closed)',
        company: 'Northwind Traders Inc.',
        phone: '(208) 555-0133',
        parent: CUSTOMER_IDS.northwind,
        inactive: true,
        notes: 'Store closed in March. Kept for history.',
    }),
    customer({
        id: CUSTOMER_IDS.alvarez,
        display_name: 'Marisol Alvarez',
        first_name: 'Marisol',
        last_name: 'Alvarez',
        email: 'marisol.alvarez@gmail.example',
        mobile: '(415) 555-0123',
        billing_address: address('27 Dolores Terrace', 'San Francisco', 'CA', '94110'),
    }),
    customer({
        id: CUSTOMER_IDS.alvarezRemodel,
        display_name: 'Alvarez kitchen remodel',
        first_name: 'Marisol',
        last_name: 'Alvarez',
        email: 'marisol.alvarez@gmail.example',
        mobile: '(415) 555-0123',
        parent: CUSTOMER_IDS.alvarez,
        billing_address: address('27 Dolores Terrace', 'San Francisco', 'CA', '94110'),
        shipping_address: address('1902 Vallejo Street', 'San Francisco', 'CA', '94123', 'Unit B'),
        notes: 'Deliver materials to the job site, not the billing address. Gate code 4417.',
    }),
    customer({
        id: CUSTOMER_IDS.stJude,
        display_name: 'St. Jude Community Hospital Foundation of the Greater Willamette Valley',
        company: 'St. Jude Community Hospital Foundation',
        first_name: 'Theodore',
        last_name: 'Okonkwo-Lindqvist',
        email: 'theodore.okonkwo-lindqvist@stjudecommunityhospitalfoundation.org',
        phone: '(541) 555-0188',
        website: 'https://stjudecommunityhospitalfoundation.org/giving/corporate-partners',
        billing_address: address(
            'Development Office, Building C, 2200 Northwest Hospital Campus Drive',
            'Corvallis',
            'OR',
            '97330-1234',
            'Attn: Accounts Payable, Mail Stop 14-B'
        ),
    }),
    customer({
        id: CUSTOMER_IDS.stJudeAnnex,
        display_name: 'St. Jude West Annex renovation',
        company: 'St. Jude Community Hospital Foundation',
        email: 'facilities@stjudecommunityhospitalfoundation.org',
        parent: CUSTOMER_IDS.stJude,
    }),
    customer({
        id: CUSTOMER_IDS.stJudeGala,
        display_name: 'St. Jude Annual Spring Gala and Silent Auction Catering',
        company: 'St. Jude Community Hospital Foundation',
        email: 'gala@stjudecommunityhospitalfoundation.org',
        parent: CUSTOMER_IDS.stJude,
    }),
    customer({
        id: CUSTOMER_IDS.oldMill,
        display_name: 'Old Mill Bakery',
        company: 'Old Mill Bakery & Cafe',
        email: 'hello@oldmillbakery.example',
        phone: '(360) 555-0101',
        inactive: true,
        notes: 'Business sold in 2025.',
    }),
    customer({
        id: 'cust_aspen_0001',
        display_name: 'Aspen Ridge Dental',
        company: 'Aspen Ridge Dental PC',
        email: 'office@aspenridgedental.example',
        phone: '(970) 555-0156',
        billing_address: address('310 Main Street', 'Aspen', 'CO', '81611'),
    }),
    customer({
        id: 'cust_bluef_0001',
        display_name: 'Bluefin Marine Supply',
        email: 'orders@bluefinmarine.example',
        phone: '(907) 555-0164',
    }),
    customer({
        id: 'cust_cedar_0001',
        display_name: 'Cedar & Pine Landscaping',
        company: 'Cedar and Pine Landscaping Co.',
        email: 'office@cedarpine.example',
        phone: '(425) 555-0172',
    }),
    customer({
        id: 'cust_chen_00001',
        display_name: 'Wei Chen',
        first_name: 'Wei',
        last_name: 'Chen',
        email: 'wei.chen@fastmail.example',
        mobile: '(646) 555-0138',
    }),
    customer({
        id: 'cust_delta_0001',
        display_name: 'Delta Freight Partners',
        email: 'ap@deltafreight.example',
        phone: '(901) 555-0190',
    }),
    customer({
        id: 'cust_evrgr_0001',
        display_name: 'Evergreen Montessori School',
        company: 'Evergreen Montessori School Association',
        email: 'business.office@evergreenmontessori.example',
        phone: '(360) 555-0129',
    }),
    customer({
        id: 'cust_fox_000001',
        display_name: 'Fox Hollow Vineyards',
        email: 'cellar@foxhollow.example',
        phone: '(707) 555-0115',
        website: 'https://foxhollow.example',
    }),
    customer({
        id: 'cust_grnt_00001',
        display_name: 'Granite Peak Outfitters',
        email: 'accounts@granitepeak.example',
        phone: '(801) 555-0147',
    }),
    customer({
        id: 'cust_iris_00001',
        display_name: 'Iris Nakamura',
        first_name: 'Iris',
        last_name: 'Nakamura',
        email: 'iris@nakamura-design.example',
    }),
    customer({
        id: 'cust_juni_00001',
        display_name: 'Juniper Street Coffee',
        email: 'owner@juniperstreet.example',
        phone: '(512) 555-0161',
    }),
    customer({
        id: 'cust_lake_00001',
        display_name: 'Lakeshore Property Management',
        company: 'Lakeshore Property Management Group',
        email: 'invoices@lakeshorepm.example',
        phone: '(312) 555-0185',
    }),
    customer({
        id: 'cust_obrn_00001',
        display_name: "Sean O'Brien",
        first_name: 'Sean',
        last_name: "O'Brien",
        mobile: '(617) 555-0108',
    }),
    customer({
        id: 'cust_quar_00001',
        display_name: 'Quarry Lane Architects',
        email: 'studio@quarrylane.example',
        phone: '(206) 555-0151',
    }),
] satisfies Omit<BooksCustomers, ServerOnlyColumn>[]

export const EMPTY_CUSTOMERS: CustomerFixtureRecord[] = []

// A search that matches nothing in CUSTOMERS, for the no-match state.
export const NO_MATCH_SEARCH = 'Zephyr Logistics'
