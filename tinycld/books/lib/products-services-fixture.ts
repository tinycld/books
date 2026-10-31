// Synthetic products and services for the seed (seed.ts) and the helix reference
// route, typed against the generated `BooksProducts` and `BooksBundleItems`, as
// vendor-form-fixture.ts is typed against `BooksVendors`, so tsc checks every
// column against the schema (migration 2100000005).
//
// Accounts are the seeded e2e book's (lib/seed-accounts.ts), not the starter
// chart: 4000 Consulting Income is the one income account; 6200 Software
// Subscriptions and 6210 Design Tools are the expense accounts; 6900 Old Petty
// Cash is inactive, so the business laptop names an account that became inactive
// after it was saved. The seed adds no account (design gate G7).

import type { BooksBundleItems, BooksProducts } from '../types'
import type { ColumnOf } from './fixture-columns'
import { SEED_ACCOUNTS } from './seed-accounts'

export type { ProductType } from './product-types'

// The generated type holds the JSON column as `any`, which would reach every
// reader of a fixture row untyped, so the fixture keeps it typed. The row never
// carries `name_key`: it is hidden, so a live query never receives it, and the
// server's guard sets it on every write. `currency` is stamped by the server on
// create, so the seed leaves it out; the reference route reads it as a live row
// would. The account columns are relation ids, known only after the seed creates
// the accounts, so the fixture names them by seed account number instead (empty
// for none); the seed maps each number to the created account's id.
export type ProductFixtureRecord = Omit<
    BooksProducts,
    ColumnOf<BooksProducts, 'fields' | 'name_key' | 'income_account' | 'expense_account'>
> & {
    fields: Record<string, unknown> | null
    income_account_number: string
    expense_account_number: string
}

type ProductSeed = Pick<ProductFixtureRecord, 'id' | 'type' | 'name'> &
    Partial<Omit<ProductFixtureRecord, 'id' | 'type' | 'name'>>

const INCOME_TYPES: ReadonlySet<string> = new Set(['income', 'other_income'])

// The accounts the Income account picker offers on the seeded book.
export const FIXTURE_INCOME_ACCOUNTS = SEED_ACCOUNTS.filter(account =>
    INCOME_TYPES.has(account.type)
)

// The accounts the Expense account picker may name: the seed's accounts less
// Accounts receivable and Accounts payable, which the server refuses.
export const FIXTURE_EXPENSE_ACCOUNTS = SEED_ACCOUNTS.filter(
    account => account.type !== 'accounts_receivable' && account.type !== 'accounts_payable'
)

// A number that is not an allowed seeded account is a fixture bug, not data.
function checkedNumber(
    number: string,
    allowed: readonly { number: string }[],
    productId: string,
    column: string
) {
    if (number === '' || allowed.some(account => account.number === number)) return
    throw new Error(
        `product fixture: ${productId} ${column} names ${number}, not an allowed account`
    )
}

// A bundle has no price, cost or accounts of its own, and a Service or
// Non-inventory item needs an income account: the server's guard refuses
// anything else, so the fixture refuses it first.
function checkedRow(row: ProductFixtureRecord): ProductFixtureRecord {
    checkedNumber(row.income_account_number, FIXTURE_INCOME_ACCOUNTS, row.id, 'income')
    checkedNumber(row.expense_account_number, FIXTURE_EXPENSE_ACCOUNTS, row.id, 'expense')
    const isBundle = row.type === 'bundle'
    const bundleHasOwn =
        row.price !== 0 ||
        row.cost !== 0 ||
        row.income_account_number !== '' ||
        row.expense_account_number !== '' ||
        row.purchase_description !== '' ||
        row.purchases
    if (isBundle && bundleHasOwn) {
        throw new Error(`product fixture: bundle ${row.id} has a price, cost or account`)
    }
    if (!isBundle && row.income_account_number === '') {
        throw new Error(`product fixture: ${row.id} has no income account`)
    }
    if (row.purchases && row.expense_account_number === '') {
        throw new Error(`product fixture: ${row.id} purchases with no expense account`)
    }
    return row
}

function product(seed: ProductSeed): ProductFixtureRecord {
    const isBundle = seed.type === 'bundle'
    return checkedRow({
        sku: '',
        sales_description: '',
        price: 0,
        income_account_number: isBundle ? '' : '4000',
        purchases: false,
        purchase_description: '',
        cost: 0,
        expense_account_number: '',
        inactive: false,
        currency: 'USD',
        form: '',
        fields: null,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...seed,
    })
}

// The rows the reference states and the e2e steps pick out. Ids are valid
// PocketBase ids (15 lowercase letters and digits), so the seed may send them.
export const PRODUCT_IDS = {
    // Non-inventory, purchasing on, every purchase field filled: the open product of
    // the panel state.
    designLicense: 'proddesignlic01',
    // Non-inventory on two bundles, purchasing on.
    accessPoint: 'prodwifiap00001',
    // On two bundles: the delete refused state.
    patchCable: 'prodcat6patch01',
    // Service with no SKU and a long description: the Service form.
    taxPrep: 'prodtaxprep0001',
    // A name long enough to truncate in a row and wrap on a card.
    networkVisit: 'prodnetvisit001',
    // Stored expense account 6900 is inactive.
    laptop: 'prodlaptop14001',
    // Inactive and on a bundle: the "(inactive)" bundle row.
    cableTies: 'prodcableties01',
    // Inactive, on no bundle.
    faxSetup: 'prodfaxsetup001',
    // A sales price of 0: the Sales price cell is blank.
    consultation: 'prodconsult0001',
    // Non-inventory with purchasing off but a stored cost: the Cost cell is blank.
    paper: 'prodpapercase01',
    // Bundles.
    officeNetwork: 'bndlofficenet01',
    homeOffice: 'bndlhomeoffic01',
    onboarding: 'bndlonboard0001',
    backOffice: 'bndlbackoffic01',
} as const

const SERVICES = [
    product({
        id: 'prodbookkeep001',
        type: 'service',
        name: 'Bookkeeping catch-up (per month)',
        sku: 'SVC-BK-01',
        sales_description:
            'Reconcile one month of bank and card activity and categorize every line.',
        price: 45000,
    }),
    product({
        id: PRODUCT_IDS.consultation,
        type: 'service',
        name: 'Initial consultation',
        sales_description: 'A free first hour to scope the work.',
    }),
    product({
        id: PRODUCT_IDS.networkVisit,
        type: 'service',
        name: 'On-site network troubleshooting, two-hour minimum with travel inside the Portland metro area',
        sku: 'SVC-NET-2H',
        sales_description:
            'A technician visits, finds the fault and fixes it or leaves a written plan. Travel inside the Portland metro area is included; parts are billed separately at cost plus ten percent, and time past the first two hours is billed in fifteen-minute steps.',
        price: 28000,
    }),
    product({
        id: PRODUCT_IDS.taxPrep,
        type: 'service',
        name: 'Year-end tax preparation',
        sales_description:
            'Federal and state return for a small business, with one round of review.',
        price: 125000,
    }),
    product({
        id: 'prodwebretain01',
        type: 'service',
        name: 'Website maintenance retainer',
        sku: 'SVC-WEB-RET',
        price: 37500,
    }),
    product({
        id: 'prodremoteit001',
        type: 'service',
        name: 'Remote IT support (hourly)',
        sku: 'SVC-IT-HR',
        price: 9500,
    }),
    product({
        id: 'prodpayrollst01',
        type: 'service',
        name: 'Payroll setup',
        sku: 'SVC-PAY-SET',
        sales_description: 'Set up the payroll provider, employees, pay schedule and tax accounts.',
        price: 60000,
    }),
    product({
        id: 'prodlogodesign1',
        type: 'service',
        name: 'Logo and brand design package',
        sku: 'SVC-DES-LOGO',
        price: 180000,
    }),
    product({
        id: 'prodbackupaud01',
        type: 'service',
        name: 'Data backup audit',
        sku: 'SVC-BKP-AUD',
        price: 24000,
    }),
    product({
        id: 'prodtraining001',
        type: 'service',
        name: 'Software training session (per hour)',
        sku: 'SVC-TRN-HR',
        price: 12000,
    }),
    product({
        id: 'prodwsimaging01',
        type: 'service',
        name: 'Workstation setup and imaging',
        sku: 'SVC-WS-SET',
        price: 15000,
    }),
    product({
        id: PRODUCT_IDS.faxSetup,
        type: 'service',
        name: 'Fax line setup',
        sku: 'SVC-FAX',
        price: 6500,
        inactive: true,
    }),
]

const NON_INVENTORY = [
    product({
        id: PRODUCT_IDS.accessPoint,
        type: 'non_inventory',
        name: 'Wireless access point',
        sku: 'HW-WAP-6E',
        sales_description: 'Wi-Fi 6E ceiling-mount access point, installed and configured.',
        price: 18900,
        purchases: true,
        purchase_description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
        cost: 12140,
        expense_account_number: '6200',
    }),
    product({
        id: PRODUCT_IDS.patchCable,
        type: 'non_inventory',
        name: 'Cat6 patch cable, 10 ft',
        sku: 'HW-CAT6-10',
        price: 875,
        purchases: true,
        cost: 310,
        expense_account_number: '6200',
    }),
    product({
        id: PRODUCT_IDS.cableTies,
        type: 'non_inventory',
        name: 'Cable ties, 100 pack',
        sku: 'HW-CT-100',
        price: 1250,
        purchases: true,
        cost: 620,
        expense_account_number: '6210',
        inactive: true,
    }),
    product({
        id: PRODUCT_IDS.laptop,
        type: 'non_inventory',
        name: 'Business laptop, 14-inch, 32 GB memory, 1 TB storage, three-year on-site warranty',
        sku: 'HW-LT14-32',
        sales_description: 'Configured with the standard image and enrolled in device management.',
        price: 164900,
        purchases: true,
        purchase_description: 'Laptop, 14-inch, 32 GB, 1 TB, with the three-year on-site warranty.',
        cost: 131255,
        expense_account_number: '6900',
    }),
    product({
        id: PRODUCT_IDS.designLicense,
        type: 'non_inventory',
        name: 'Design software license (annual)',
        sku: 'SW-DES-ANN',
        sales_description:
            'One seat of the design suite for twelve months, set up on your machine.',
        price: 42000,
        purchases: true,
        purchase_description: 'Annual design suite seat, reseller price.',
        cost: 36000,
        expense_account_number: '6210',
    }),
    product({
        id: PRODUCT_IDS.paper,
        type: 'non_inventory',
        name: 'Printer paper, case',
        price: 4800,
        // Purchasing was turned off later: the purchase fields are kept, not shown.
        cost: 3100,
        expense_account_number: '6200',
    }),
    product({
        id: 'prodsurge8out01',
        type: 'non_inventory',
        name: 'Surge protector, 8 outlet',
        sku: 'HW-SURGE-8',
        price: 3400,
    }),
    product({
        id: 'prodtonerblk001',
        type: 'non_inventory',
        name: 'Toner cartridge, black',
        sku: 'HW-TONER-BK',
        price: 8900,
    }),
]

const BUNDLES = [
    product({
        id: PRODUCT_IDS.officeNetwork,
        type: 'bundle',
        name: 'Small office network install, up to ten workstations',
        sku: 'BND-NET-10',
        sales_description: 'Two access points, cabling and a technician visit.',
    }),
    product({
        id: PRODUCT_IDS.homeOffice,
        type: 'bundle',
        name: 'Home office setup kit',
        sales_description: 'Access point, cabling and two hours on site.',
    }),
    product({
        id: PRODUCT_IDS.onboarding,
        type: 'bundle',
        name: 'New hire onboarding',
        sku: 'BND-HIRE',
    }),
    product({
        id: PRODUCT_IDS.backOffice,
        type: 'bundle',
        name: 'Monthly back-office package',
        sku: 'BND-BACK-MO',
    }),
]

export const PRODUCTS = [...SERVICES, ...NON_INVENTORY, ...BUNDLES] satisfies ProductFixtureRecord[]

const PRODUCT_TYPE_BY_ID = new Map(PRODUCTS.map(row => [row.id, row.type]))

// A row's bundle must be a bundle and its product must not be: the server's guard
// refuses anything else, so the fixture refuses it first.
function item(
    id: string,
    bundle: string,
    product: string,
    quantity: number,
    position: number
): BooksBundleItems {
    if (PRODUCT_TYPE_BY_ID.get(bundle) !== 'bundle') {
        throw new Error(`product fixture: bundle item ${id} names ${bundle}, not a bundle`)
    }
    const productType = PRODUCT_TYPE_BY_ID.get(product)
    if (productType === undefined || productType === 'bundle') {
        throw new Error(`product fixture: bundle item ${id} names ${product}, not an item`)
    }
    return {
        id,
        bundle,
        product,
        quantity,
        position,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

// Rows in position order per bundle. The server refuses a row whose product is
// inactive when the row is created, so the seed creates every row before it makes
// the cable ties and the fax setup inactive.
export const BUNDLE_ITEMS = [
    item('bitemoffnet0001', PRODUCT_IDS.officeNetwork, PRODUCT_IDS.accessPoint, 2, 0),
    item('bitemoffnet0002', PRODUCT_IDS.officeNetwork, PRODUCT_IDS.patchCable, 12, 1),
    item('bitemoffnet0003', PRODUCT_IDS.officeNetwork, PRODUCT_IDS.cableTies, 1, 2),
    item('bitemoffnet0004', PRODUCT_IDS.officeNetwork, PRODUCT_IDS.networkVisit, 1, 3),
    item('bitemhomeoff001', PRODUCT_IDS.homeOffice, PRODUCT_IDS.accessPoint, 1, 0),
    item('bitemhomeoff002', PRODUCT_IDS.homeOffice, PRODUCT_IDS.patchCable, 2, 1),
    item('bitemhomeoff003', PRODUCT_IDS.homeOffice, 'prodsurge8out01', 1, 2),
    item('bitemhomeoff004', PRODUCT_IDS.homeOffice, 'prodwsimaging01', 1, 3),
    item('bitemhomeoff005', PRODUCT_IDS.homeOffice, 'prodremoteit001', 1.5, 4),
    item('bitemonboard001', PRODUCT_IDS.onboarding, PRODUCT_IDS.laptop, 1, 0),
    item('bitemonboard002', PRODUCT_IDS.onboarding, 'prodwsimaging01', 1, 1),
    item('bitemonboard003', PRODUCT_IDS.onboarding, 'prodtraining001', 2, 2),
    item('bitembackoff001', PRODUCT_IDS.backOffice, 'prodbookkeep001', 1, 0),
    item('bitembackoff002', PRODUCT_IDS.backOffice, 'prodremoteit001', 2, 1),
] satisfies BooksBundleItems[]

export const EMPTY_PRODUCTS: ProductFixtureRecord[] = []

// Products exist, but every one is inactive: the "No active products or services" state.
export const ALL_INACTIVE_PRODUCTS = PRODUCTS.filter(row => row.inactive)

// A search that matches nothing in PRODUCTS, for the no-match state.
export const NO_MATCH_SEARCH = 'Espresso machine'
