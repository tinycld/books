import { describe, expect, it } from 'vitest'
import { PAYMENT_TERM_KEYS } from '../tinycld/books/lib/payment-terms'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { ALL_INACTIVE_VENDORS, VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

function vendorById(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row) throw new Error(`no fixture vendor ${id}`)
    return row
}

function seedAccount(number: string) {
    return SEED_ACCOUNTS.find(account => account.number === number)
}

describe('vendor fixture', () => {
    it('names only seeded accounts that are not Accounts receivable or Accounts payable', () => {
        for (const row of VENDORS) {
            if (row.expense_account_number === '') continue
            const account = seedAccount(row.expense_account_number)
            expect(account, `${row.id} names ${row.expense_account_number}`).toBeDefined()
            expect(['accounts_receivable', 'accounts_payable']).not.toContain(account?.type)
        }
    })

    it('gives Pacific Power the seeded account that is inactive', () => {
        expect(vendorById(VENDOR_IDS.pacificPower).expense_account_number).toBe('6900')
        expect(seedAccount('6900')?.inactive).toBe(true)
    })

    it('gives Ironclad 1500 and Office Supply World 6210', () => {
        expect(vendorById(VENDOR_IDS.ironclad).expense_account_number).toBe('1500')
        expect(vendorById(VENDOR_IDS.officeSupply).expense_account_number).toBe('6210')
    })

    it('has exactly the two inactive vendors of ALL_INACTIVE_VENDORS', () => {
        const inactive = VENDORS.filter(row => row.inactive).map(row => row.display_name)
        expect(inactive.sort()).toEqual(['Coastal Coffee Roasters', 'Old Town Print Shop'])
        expect(ALL_INACTIVE_VENDORS.map(row => row.display_name).sort()).toEqual(inactive)
    })

    it('uses every payment term and none', () => {
        const used = new Set(VENDORS.map(row => row.terms))
        for (const key of PAYMENT_TERM_KEYS) {
            expect(used, key).toContain(key)
        }
        expect(used).toContain('')
    })

    it('has ids the seed may send', () => {
        for (const row of VENDORS) {
            expect(row.id).toMatch(/^[a-z0-9]{15}$/)
        }
    })

    it('has display names that are unique without regard to case', () => {
        const names = VENDORS.map(row => row.display_name.toLowerCase())
        const repeated = names.filter((name, index) => names.indexOf(name) !== index)
        expect(repeated).toEqual([])
    })
})
