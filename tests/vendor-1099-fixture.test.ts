import { describe, expect, it } from 'vitest'
import { isExpenseGroupType } from '../tinycld/books/lib/form-1099'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    ACCOUNT_BOXES,
    ACCOUNTS_1099,
    NO_EXPENSE_ACCOUNTS_1099,
    SETTINGS_1099,
    TRACKED_VENDOR_IDS,
    UNTRACKED_VENDORS_1099,
    VENDORS_1099,
} from '../tinycld/books/lib/vendor-1099-fixture'
import { VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

function trackedRow(id: string) {
    const row = VENDORS_1099.find(vendor => vendor.id === id)
    if (!row) throw new Error(`no fixture vendor ${id}`)
    return row
}

function accountByNumber(number: string) {
    const account = ACCOUNTS_1099.find(row => row.number === number)
    if (!account) throw new Error(`no fixture account ${number}`)
    return account
}

// EIN prefixes the IRS never assigns: no tax ID here can be a real business's.
const UNASSIGNED_EIN_PREFIXES = ['07', '18', '79']

describe('vendor 1099 fixture: vendors', () => {
    it('tracks exactly the five TRACKED_VENDOR_IDS', () => {
        const tracked = VENDORS_1099.filter(row => row.track_1099).map(row => row.id)
        expect(tracked.sort()).toEqual(Object.values(TRACKED_VENDOR_IDS).sort())
        expect(new Set(tracked).size).toBe(5)
    })

    it('gives the EIN and attorney vendors a synthetic, dashed EIN', () => {
        for (const id of [TRACKED_VENDOR_IDS.ein, TRACKED_VENDOR_IDS.attorney]) {
            const row = trackedRow(id)
            expect(row.tax_id_type, id).toBe('ein')
            expect(row.tax_id, id).toMatch(/^\d{2}-\d{7}$/)
            expect(UNASSIGNED_EIN_PREFIXES, id).toContain(row.tax_id.slice(0, 2))
        }
    })

    it('gives the SSN vendor a dashed SSN in the range reserved for examples', () => {
        const row = trackedRow(TRACKED_VENDOR_IDS.ssn)
        expect(row.tax_id_type).toBe('ssn')
        expect(row.tax_id).toMatch(/^\d{3}-\d{2}-\d{4}$/)
        expect(row.tax_id >= '987-65-4320' && row.tax_id <= '987-65-4329').toBe(true)
    })

    it('leaves the missing-tax-ID vendor with no tax ID and no type', () => {
        const row = trackedRow(TRACKED_VENDOR_IDS.missingTaxId)
        expect(row.tax_id).toBe('')
        expect(row.tax_id_type).toBe('')
    })

    it('tracks an inactive vendor', () => {
        const seeded = VENDORS.find(vendor => vendor.id === TRACKED_VENDOR_IDS.inactive)
        expect(seeded?.inactive).toBe(true)
    })

    it('stores every untracked vendor with no legal name, type or tax ID', () => {
        const untracked = VENDORS_1099.filter(row => !row.track_1099)
        expect(untracked.length).toBe(VENDORS.length - 5)
        for (const row of untracked) {
            expect(row.track_1099, row.id).toBe(false)
            expect(row.legal_name, row.id).toBe('')
            expect(row.tax_id_type, row.id).toBe('')
            expect(row.tax_id, row.id).toBe('')
        }
    })

    it('UNTRACKED_VENDORS_1099 tracks no vendor', () => {
        expect(UNTRACKED_VENDORS_1099.map(row => row.id).sort()).toEqual(
            VENDORS.map(row => row.id).sort()
        )
        for (const row of UNTRACKED_VENDORS_1099) {
            expect(row.track_1099, row.id).toBe(false)
        }
    })
})

describe('vendor 1099 fixture: accounts and settings', () => {
    it('sets boxes only on seeded expense-group accounts', () => {
        for (const box of ACCOUNT_BOXES) {
            const account = SEED_ACCOUNTS.find(row => row.number === box.number)
            expect(account, box.number).toBeDefined()
            expect(isExpenseGroupType(account?.type ?? ''), box.number).toBe(true)
        }
    })

    it('gives sub-account 6210 its own box while its parent 6200 has none', () => {
        const parent = accountByNumber('6200')
        const child = accountByNumber('6210')
        expect(child.parent).toBe(parent.id)
        expect(parent.form_1099_box).toBe('')
        expect(child.form_1099_box).toBe('nec_1')
    })

    it('maps 6100, 6210 and the inactive 6900', () => {
        const mapped = ACCOUNTS_1099.filter(row => row.form_1099_box !== '')
        expect(mapped.map(row => row.number).sort()).toEqual(['6100', '6210', '6900'])
        const petty = accountByNumber('6900')
        expect(petty.inactive).toBe(true)
        expect(petty.form_1099_box).toBe('misc_8')
    })

    it('sets the threshold to $2,000.00 in cents', () => {
        expect(SETTINGS_1099.threshold_1099).toBe(200000)
    })

    it('NO_EXPENSE_ACCOUNTS_1099 holds every account but the expense-group ones', () => {
        expect(NO_EXPENSE_ACCOUNTS_1099.some(row => isExpenseGroupType(row.type))).toBe(false)
        expect(NO_EXPENSE_ACCOUNTS_1099.map(row => row.id)).toEqual(
            ACCOUNTS_1099.filter(row => !isExpenseGroupType(row.type)).map(row => row.id)
        )
    })
})
