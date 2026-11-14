import { describe, expect, it } from 'vitest'
import {
    BILL_ACCOUNT_EMPTY_TEXT,
    billAccountOptions,
    PURCHASE_PRODUCT_EMPTY_TEXT,
    purchaseProductOptions,
    purchaseProductSuffix,
    VENDOR_PICKER_EMPTY_TEXT,
    vendorPickerOptions,
} from '../tinycld/books/lib/bill-pickers'
import {
    ALL_INACTIVE_PRODUCTS,
    PRODUCT_IDS,
    PRODUCTS,
} from '../tinycld/books/lib/products-services-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { ALL_INACTIVE_VENDORS, VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

// The pure option builders of the bill's pickers (spec §3.4): the Account cell, the
// Product or service cell and the Vendor field.

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

// The seeded e2e book's chart, plus an active cost of goods account and an active other
// expense account (the seed has neither), so all three listed types are present.
const ACCOUNTS = [
    ...SEED_ACCOUNTS.map(account => ({
        id: idOf(account.number),
        name: account.name,
        number: account.number,
        type: account.type,
        parent: seedParentId(account.parent),
        inactive: account.inactive ?? false,
    })),
    {
        id: idOf('5000'),
        name: 'Cost of goods sold',
        number: '5000',
        type: 'cost_of_goods_sold',
        parent: '',
        inactive: false,
    },
    {
        id: idOf('7000'),
        name: 'Bank fees',
        number: '7000',
        type: 'other_expense',
        parent: '',
        inactive: false,
    },
]

describe('billAccountOptions', () => {
    it('lists only active expense, other expense and cost of goods accounts, in chart order, indented', () => {
        expect(billAccountOptions(ACCOUNTS, '')).toEqual([
            { id: idOf('5000'), label: '5000 Cost of goods sold', indent: 0 },
            { id: idOf('6100'), label: '6100 Rent', indent: 0 },
            { id: idOf('6200'), label: '6200 Software Subscriptions', indent: 0 },
            { id: idOf('6210'), label: '6210 Design Tools', indent: 1 },
            { id: idOf('7000'), label: '7000 Bank fees', indent: 0 },
        ])
    })

    it('never lists Office Equipment (a fixed asset) or the inactive Old Petty Cash', () => {
        const labels = billAccountOptions(ACCOUNTS, '').map(option => option.label)
        expect(labels).not.toContain('1500 Office Equipment')
        expect(labels).not.toContain('6900 Old Petty Cash')
    })

    it('adds a stored inactive account, marked inactive', () => {
        const labels = billAccountOptions(ACCOUNTS, idOf('6900')).map(option => option.label)
        expect(labels).toContain('6900 Old Petty Cash (inactive)')
        expect(labels).toContain('6100 Rent')
    })

    it('is empty with no expense account, and the cell then says so', () => {
        const noExpense = ACCOUNTS.filter(
            account =>
                !['expense', 'other_expense', 'cost_of_goods_sold'].includes(account.type) ||
                account.inactive
        )
        expect(billAccountOptions(noExpense, '')).toEqual([])
        expect(BILL_ACCOUNT_EMPTY_TEXT).toBe('No expense accounts')
    })
})

const nameOf = (id: string) => PRODUCTS.find(product => product.id === id)?.name ?? id

describe('purchaseProductOptions', () => {
    it('lists only active service and non-inventory products I purchase', () => {
        const options = purchaseProductOptions(PRODUCTS, '')
        const labels = options.map(option => option.label)
        expect(labels).toContain('Wireless access point')
        expect(labels).toContain('Cat6 patch cable, 10 ft')
        expect(labels).not.toContain('Printer paper, case')
        expect(labels).not.toContain('Cable ties, 100 pack')
        for (const option of options) {
            const product = PRODUCTS.find(row => row.id === option.id)
            expect(product?.purchases, option.label).toBe(true)
            expect(product?.inactive, option.label).toBe(false)
            expect(['service', 'non_inventory'], option.label).toContain(product?.type)
        }
    })

    it('adds a stored inactive product, marked inactive', () => {
        const labels = purchaseProductOptions(PRODUCTS, PRODUCT_IDS.cableTies).map(o => o.label)
        expect(labels).toContain(`${nameOf(PRODUCT_IDS.cableTies)} (inactive)`)
    })

    it('adds a stored product I no longer purchase, marked not purchased', () => {
        const labels = purchaseProductOptions(PRODUCTS, PRODUCT_IDS.paper).map(o => o.label)
        expect(labels).toContain('Printer paper, case (not purchased)')
    })

    it('marks a stored product that is inactive and not purchased only inactive', () => {
        const products = PRODUCTS.map(product =>
            product.id === PRODUCT_IDS.paper ? { ...product, inactive: true } : product
        )
        const labels = purchaseProductOptions(products, PRODUCT_IDS.paper).map(o => o.label)
        expect(labels).toContain('Printer paper, case (inactive)')
        expect(labels).not.toContain('Printer paper, case (not purchased)')
    })

    it('is empty with no purchased product, and the cell then says so', () => {
        expect(purchaseProductOptions(ALL_INACTIVE_PRODUCTS, '')).toEqual([])
        expect(PURCHASE_PRODUCT_EMPTY_TEXT).toBe('No purchased products or services')
    })
})

// The mark a bill line's Product trigger and the stored option show (spec §3.4, Do 2).
describe('purchaseProductSuffix', () => {
    it('is "(inactive)" for an inactive product, whether or not I purchase it', () => {
        expect(purchaseProductSuffix({ inactive: true, purchases: true })).toBe('(inactive)')
        expect(purchaseProductSuffix({ inactive: true, purchases: false })).toBe('(inactive)')
    })

    it('is "(not purchased)" for an active product I do not purchase', () => {
        expect(purchaseProductSuffix({ inactive: false, purchases: false })).toBe('(not purchased)')
    })

    it('is nothing for an active product I purchase', () => {
        expect(purchaseProductSuffix({ inactive: false, purchases: true })).toBeUndefined()
    })
})

describe('vendorPickerOptions', () => {
    it('lists the active vendors by name', () => {
        const options = vendorPickerOptions(VENDORS, '')
        const active = VENDORS.filter(vendor => !vendor.inactive)
            .map(vendor => vendor.display_name)
            .sort((a, b) => a.localeCompare(b))
        expect(options.map(option => option.label)).toEqual(active)
        expect(options.find(o => o.label === 'Summit IT Services')?.id).toBe(VENDOR_IDS.summit)
    })

    it('keeps a stored inactive vendor, marked inactive, as a correction needs', () => {
        const labels = vendorPickerOptions(VENDORS, VENDOR_IDS.coastalCoffee).map(o => o.label)
        expect(labels).toContain('Coastal Coffee Roasters (inactive)')
        expect(labels).not.toContain('Old Town Print Shop (inactive)')
    })

    it('is empty with no active vendor, and the picker then says so', () => {
        expect(vendorPickerOptions(ALL_INACTIVE_VENDORS, '')).toEqual([])
        expect(VENDOR_PICKER_EMPTY_TEXT).toBe('No active vendors')
    })
})
