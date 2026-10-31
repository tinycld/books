// Synthetic 1099 data for the seed (seed.ts) and the helix reference route,
// which reads these names.
//
// The rows are typed with `satisfies` against the generated `BooksVendors`,
// `BooksAccounts` and `BooksSettings` (../types), so tsc checks every 1099
// column against the migrations.
//
// Accounts are the seeded e2e book's (lib/seed-accounts.ts), named by number;
// vendors are the seeded vendors of lib/vendor-form-fixture.ts, named by id.
// Tax IDs are synthetic: every EIN uses a prefix the IRS never assigns (07,
// 18, 79) and the SSN is in the range the SSA reserves for examples
// (987-65-4320 to 987-65-4329), so none can be a real person's or business's.

import type { BooksAccounts, BooksSettings, BooksVendors } from '../types'
import type { ColumnOf } from './fixture-columns'
import { isExpenseGroupType } from './form-1099'
import { SEED_ACCOUNTS } from './seed-accounts'
import { VENDOR_IDS, VENDORS, type VendorFixtureRecord } from './vendor-form-fixture'

export type { Box1099Key } from './form-1099'
export type { TaxIdType } from './tax-id'

// The migration's settings row: $2,000.00 (packet Q6).
export const SETTINGS_1099 = { threshold_1099: 200000 } satisfies Pick<
    BooksSettings,
    'threshold_1099'
>

// The ids of the tracked vendors, by the edge each one shows.
export const TRACKED_VENDOR_IDS = {
    // A business with an EIN; display name and legal name long enough to
    // truncate.
    ein: VENDOR_IDS.willamette,
    // A sole proprietor with an SSN; the legal name differs from the display
    // name.
    ssn: VENDOR_IDS.okafor,
    // An attorney firm (MISC 10), with an EIN.
    attorney: 'vendkeystonel01',
    // Tracked before its W-9 arrived: no legal name, no tax ID.
    missingTaxId: 'vendgreenline01',
    // An inactive vendor stays listed, marked Inactive.
    inactive: VENDOR_IDS.oldTownPrint,
} as const

// The values the seed writes on each tracked vendor, stored (dashed) form.
export const VENDOR_1099_PATCHES = [
    {
        id: TRACKED_VENDOR_IDS.ein,
        track_1099: true,
        legal_name:
            'Willamette Valley Commercial Cleaning & Janitorial Services Cooperative Association',
        tax_id_type: 'ein',
        tax_id: '07-3418265',
    },
    {
        id: TRACKED_VENDOR_IDS.ssn,
        track_1099: true,
        legal_name: 'Jamal A. Okafor',
        tax_id_type: 'ssn',
        tax_id: '987-65-4321',
    },
    {
        id: TRACKED_VENDOR_IDS.attorney,
        track_1099: true,
        legal_name: 'Keystone Legal Group, P.C.',
        tax_id_type: 'ein',
        tax_id: '18-5092741',
    },
    {
        id: TRACKED_VENDOR_IDS.missingTaxId,
        track_1099: true,
        legal_name: '',
        tax_id_type: '',
        tax_id: '',
    },
    {
        id: TRACKED_VENDOR_IDS.inactive,
        track_1099: true,
        legal_name: 'Old Town Print Shop LLC',
        tax_id_type: 'ein',
        tax_id: '79-6614408',
    },
] satisfies ({ id: string } & Pick<
    BooksVendors,
    ColumnOf<BooksVendors, 'track_1099' | 'legal_name' | 'tax_id_type' | 'tax_id'>
>)[]

// A patch naming a vendor the vendor fixture does not seed is a fixture bug.
for (const patch of VENDOR_1099_PATCHES) {
    if (!VENDORS.some(vendor => vendor.id === patch.id)) {
        throw new Error(`vendor 1099 fixture: ${patch.id} is not a seeded vendor`)
    }
}

export type Vendor1099Row = VendorFixtureRecord

// Every seeded vendor with its 1099 columns, as the vendors collection will
// hold them after the seed: untracked vendors keep the fixture's defaults.
export const VENDORS_1099: Vendor1099Row[] = VENDORS.map(vendor => ({
    ...vendor,
    ...VENDOR_1099_PATCHES.find(patch => patch.id === vendor.id),
}))

// No vendor is tracked: the 1099 vendors card's empty state.
export const UNTRACKED_VENDORS_1099: Vendor1099Row[] = VENDORS

// The boxes the seed sets, by seed account number. 6200 Software
// Subscriptions stays Not reported while its sub-account 6210 Design Tools
// has its own box (a sub-account does not take its parent's). 6900 Old Petty
// Cash is inactive and keeps its box, so the card lists it dimmed; its box has
// the longest label, to exercise wrapping in the select.
export const ACCOUNT_BOXES = [
    { number: '6100', form_1099_box: 'misc_1' },
    { number: '6200', form_1099_box: '' },
    { number: '6210', form_1099_box: 'nec_1' },
    { number: '6900', form_1099_box: 'misc_8' },
] satisfies { number: string; form_1099_box: BooksAccounts['form_1099_box'] }[]

for (const box of ACCOUNT_BOXES) {
    if (!SEED_ACCOUNTS.some(account => account.number === box.number)) {
        throw new Error(`vendor 1099 fixture: ${box.number} is not a seeded account`)
    }
}

export type Account1099Row = Pick<
    BooksAccounts,
    ColumnOf<
        BooksAccounts,
        'id' | 'name' | 'number' | 'type' | 'parent' | 'inactive' | 'form_1099_box'
    >
>

// Every seeded account with its box, as the accounts collection will hold
// them after the seed. The seed's account key stands in for the id the server
// assigns.
export const ACCOUNTS_1099: Account1099Row[] = SEED_ACCOUNTS.map(account => ({
    id: account.key,
    name: account.name,
    number: account.number,
    type: account.type,
    parent: account.parent ?? '',
    inactive: account.inactive ?? false,
    form_1099_box: ACCOUNT_BOXES.find(box => box.number === account.number)?.form_1099_box ?? '',
}))

// A book with no Cost of goods sold, Expense or Other expense account: the
// mapping card's empty state.
export const NO_EXPENSE_ACCOUNTS_1099: Account1099Row[] = ACCOUNTS_1099.filter(
    account => !isExpenseGroupType(account.type)
)
