// Synthetic vendors for the helix reference route and, from the migration
// checkpoint on, the seed (seed.ts).
//
// `books_vendors` does not exist yet, so `VendorRecord` below mirrors the Data
// section of docs/specs/vendor-form-design.md. The migration checkpoint
// (2100000004_create_books_vendors.js) must delete it and type VENDORS with
// `satisfies` against the generated `BooksVendors` from '../types', as
// customer-form-fixture.ts does, so tsc checks every column against the schema.

import type { CustomerAddress } from './address'
import { starterChart } from './starter-chart'

// The `terms` select values; empty means none. lib/payment-terms.ts takes over
// this list in the build.
export type VendorTermKey = 'due_on_receipt' | 'net_10' | 'net_15' | 'net_30' | 'net_60'

// One row of `books_vendors` as a live query sees it: `name_key` is hidden and
// set only by the server's guard, so a row never carries it.
interface VendorRecord {
    id: string
    display_name: string
    company: string
    first_name: string
    last_name: string
    email: string
    phone: string
    mobile: string
    website: string
    address: CustomerAddress | null
    terms: VendorTermKey | ''
    account_number: string
    expense_account: string
    notes: string
    inactive: boolean
    form: string
    fields: Record<string, unknown> | null
    created: string
    updated: string
}

// `expense_account` is a relation id, known only after the seed creates the
// accounts. The fixture names the default expense account by its starter-chart
// number instead (empty for none); the seed maps the number to the seeded
// account's id.
export type VendorFixtureRecord = Omit<VendorRecord, 'expense_account'> & {
    expense_account_number: string
}

type VendorSeed = Pick<VendorFixtureRecord, 'id' | 'display_name'> &
    Partial<Omit<VendorFixtureRecord, 'id' | 'display_name'>>

// The accounts a vendor may name: the starter chart less Accounts receivable and
// Accounts payable, which the server refuses as a default expense account.
const ALLOWED_ACCOUNTS = starterChart('owners').filter(
    account => account.type !== 'accounts_receivable' && account.type !== 'accounts_payable'
)

// A number that is not in the starter chart is a fixture bug, not data.
function checkedAccountNumber(number: string, vendorId: string): string {
    if (number === '') return number
    if (ALLOWED_ACCOUNTS.some(account => account.number === number)) return number
    throw new Error(`vendor fixture: ${vendorId} names ${number}, not an allowed starter account`)
}

function vendor(seed: VendorSeed): VendorFixtureRecord {
    const row: VendorFixtureRecord = {
        company: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        website: '',
        address: null,
        terms: '',
        account_number: '',
        expense_account_number: '',
        notes: '',
        inactive: false,
        form: '',
        fields: null,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...seed,
    }
    checkedAccountNumber(row.expense_account_number, row.id)
    return row
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

// The rows the reference states pick out. Ids are valid PocketBase ids (15
// lowercase letters and digits), so the seed may send them.
export const VENDOR_IDS = {
    // Every column filled: the open vendor of the panel and page states.
    officeSupply: 'vendoffsupply01',
    // Display name, company, email and address long enough to truncate and wrap.
    willamette: 'vendwillamett01',
    // A person, not a company: first and last name, mobile only.
    okafor: 'vendokaforjam01',
    // No email: the Email cell is blank.
    pacificPower: 'vendpacpower001',
    // Default expense account that is not an expense account (Equipment).
    ironclad: 'vendironclad001',
    // Inactive, shown only with Show inactive.
    coastalCoffee: 'vendcoastalcf01',
    oldTownPrint: 'vendoldtownpr01',
} as const

export const VENDORS: VendorFixtureRecord[] = [
    vendor({
        id: 'vendblueridge01',
        display_name: 'Blue Ridge Insurance Agency',
        company: 'Blue Ridge Insurance Agency',
        email: 'service@blueridgeins.example',
        phone: '(503) 555-0187',
        terms: 'net_30',
        account_number: 'POL-88-201934',
        expense_account_number: '6200',
    }),
    vendor({
        id: 'vendcascadeff01',
        display_name: 'Cascade Fuel & Fleet',
        company: 'Cascade Fuel and Fleet Card Services Inc.',
        email: 'billing@cascadefleet.example',
        phone: '(800) 555-0144',
        terms: 'net_15',
    }),
    vendor({
        id: 'vendharborfl001',
        display_name: 'Harbor Freight Logistics',
        email: 'ar@harborfreightlogistics.example',
        phone: '(206) 555-0123',
        terms: 'net_30',
        expense_account_number: '5000',
    }),
    vendor({
        id: 'vendnwpaper0001',
        display_name: 'Northwest Paper Co.',
        email: 'orders@nwpaper.example',
        phone: '(971) 555-0102',
        terms: 'net_10',
        expense_account_number: '6400',
    }),
    vendor({
        id: VENDOR_IDS.officeSupply,
        display_name: 'Office Supply World',
        company: 'Office Supply World',
        first_name: 'Grace',
        last_name: 'Liu',
        email: 'info@officesupplyworld.example',
        phone: '(323) 555-0188',
        mobile: '(323) 555-0142',
        website: 'http://www.officesupplyworld.example',
        address: address('4120 Commerce Boulevard', 'Los Angeles', 'CA', '90040'),
        terms: 'net_15',
        account_number: '1234567',
        expense_account_number: '6400',
        notes: 'Order by noon for next-day delivery. Ask for Grace about bulk paper pricing.',
    }),
    vendor({
        id: VENDOR_IDS.pacificPower,
        display_name: 'Pacific Power',
        company: 'PacifiCorp',
        phone: '(888) 555-0170',
        website: 'https://www.pacificpower.example',
        terms: 'due_on_receipt',
        account_number: '9902-114-387-001',
        expense_account_number: '6900',
    }),
    vendor({
        id: 'vendriveracpa01',
        display_name: 'Rivera Accounting Partners',
        company: 'Rivera Accounting Partners LLP',
        first_name: 'Maria',
        last_name: 'Rivera',
        email: 'maria@riveracpa.example',
        phone: '(503) 555-0175',
        terms: 'net_30',
        expense_account_number: '6300',
    }),
    vendor({
        id: 'vendsummitit001',
        display_name: 'Summit IT Services',
        company: 'Summit IT Services LLC',
        email: 'support@summitit.example',
        phone: '(360) 555-0119',
        terms: 'net_30',
        expense_account_number: '6700',
    }),
    vendor({
        id: VENDOR_IDS.willamette,
        display_name: 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative',
        company:
            'Willamette Valley Commercial Cleaning & Janitorial Services Cooperative Association',
        first_name: 'Bartholomew',
        last_name: 'Vandersloot-Okonkwo',
        email: 'accounts.receivable.department@willamettevalleycommercialcleaning.example',
        phone: '(503) 555-0131',
        website: 'https://willamettevalleycommercialcleaning.example/commercial-accounts/billing',
        address: address(
            'Building 4, Suite 1200, 18500 Southwest Industrial Park Boulevard',
            'Tualatin',
            'OR',
            '97062-8811',
            'Attn: Accounts Receivable, Mail Stop 7-C'
        ),
        terms: 'net_60',
        account_number: 'WVCC-COMM-2026-0004417-B',
        expense_account_number: '6700',
        notes: 'Nightly cleaning, Monday to Friday. The invoice arrives on the first business day of the month and lists each visit; check it against the door log before paying.',
    }),
    vendor({
        id: VENDOR_IDS.okafor,
        display_name: 'Jamal Okafor',
        first_name: 'Jamal',
        last_name: 'Okafor',
        email: 'jamal.okafor@fastmail.example',
        mobile: '(971) 555-0166',
        expense_account_number: '6000',
        notes: 'Freelance photographer. Prefers payment by check.',
    }),
    vendor({
        id: 'vendgreenline01',
        display_name: 'Greenline Landscaping',
        phone: '(503) 555-0193',
        terms: 'due_on_receipt',
        expense_account_number: '6700',
    }),
    vendor({
        id: 'vendmetroprop01',
        display_name: 'Metro Commercial Properties',
        company: 'Metro Commercial Properties LP',
        email: 'tenants@metrocommercial.example',
        phone: '(503) 555-0150',
        address: address('900 Southwest Fifth Avenue', 'Portland', 'OR', '97204', 'Suite 1700'),
        terms: 'due_on_receipt',
        account_number: 'Unit 210',
        expense_account_number: '6600',
    }),
    vendor({
        id: 'vendkeystonel01',
        display_name: 'Keystone Legal Group',
        email: 'billing@keystonelegal.example',
        phone: '(503) 555-0112',
        terms: 'net_30',
        expense_account_number: '6300',
    }),
    vendor({
        id: 'vendbrightwav01',
        display_name: 'Brightwave Marketing',
        email: 'hello@brightwave.example',
        phone: '(415) 555-0177',
        terms: 'net_15',
        expense_account_number: '6000',
    }),
    vendor({
        id: 'vendcityportl01',
        display_name: 'City of Portland Revenue Division',
        company: 'City of Portland',
        phone: '(503) 555-0105',
        account_number: 'BL-2026-118842',
        expense_account_number: '6800',
    }),
    vendor({
        id: 'vendfirsthbank1',
        display_name: 'First Harbor Bank',
        email: 'businessbanking@firstharbor.example',
        phone: '(800) 555-0136',
        expense_account_number: '6100',
    }),
    vendor({
        id: VENDOR_IDS.ironclad,
        display_name: 'Ironclad Equipment Rentals',
        company: 'Ironclad Equipment Rentals Inc.',
        email: 'rentals@ironclad.example',
        phone: '(253) 555-0158',
        terms: 'net_30',
        expense_account_number: '1500',
    }),
    vendor({
        id: 'vendevergrnpay1',
        display_name: 'Evergreen Payroll Services',
        email: 'support@evergreenpayroll.example',
        phone: '(206) 555-0161',
        terms: 'due_on_receipt',
        expense_account_number: '6500',
    }),
    vendor({
        id: 'vendlumenledgr1',
        display_name: 'Lumen & Ledger Coworking',
        email: 'members@lumenledger.example',
        terms: 'net_10',
        expense_account_number: '1300',
        notes: 'Annual membership, paid in advance each January.',
    }),
    vendor({
        id: 'vendzenithtel01',
        display_name: 'Zenith Telecom',
        email: 'business@zenithtelecom.example',
        phone: '(888) 555-0129',
        terms: 'net_10',
        account_number: '8841-2207',
    }),
    vendor({
        id: VENDOR_IDS.coastalCoffee,
        display_name: 'Coastal Coffee Roasters',
        email: 'wholesale@coastalcoffee.example',
        phone: '(541) 555-0183',
        terms: 'net_15',
        expense_account_number: '5000',
        inactive: true,
        notes: 'Switched suppliers in 2025.',
    }),
    vendor({
        id: VENDOR_IDS.oldTownPrint,
        display_name: 'Old Town Print Shop',
        email: 'orders@oldtownprint.example',
        phone: '(503) 555-0109',
        expense_account_number: '6000',
        inactive: true,
    }),
]

export const EMPTY_VENDORS: VendorFixtureRecord[] = []

// Vendors exist, but every one is inactive: the "No active vendors" state.
export const ALL_INACTIVE_VENDORS = VENDORS.filter(row => row.inactive)

// A search that matches nothing in VENDORS, for the no-match state.
export const NO_MATCH_SEARCH = 'Zephyr Logistics'

// The chart the fixture's account numbers come from, as the Default expense
// account picker would offer it on a book set up from the starter chart.
export const FIXTURE_ACCOUNTS = ALLOWED_ACCOUNTS
