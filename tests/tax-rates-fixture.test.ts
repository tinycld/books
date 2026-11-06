import { describe, expect, it } from 'vitest'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    CUSTOMER_TAX_PATCHES,
    SALES_TAX_ACCOUNT,
    TAX_AGENCIES,
    TAX_GROUPS,
    TAX_IDS,
    TAX_RATE_ROWS,
    TAX_RATES,
} from '../tinycld/books/lib/tax-rates-fixture'

function seedAccount(number: string) {
    return SEED_ACCOUNTS.find(account => account.number === number)
}

function agencyById(id: string) {
    return TAX_AGENCIES.find(agency => agency.id === id)
}

function repeatedCaseless(names: string[]) {
    const folded = names.map(name => name.toLowerCase())
    return folded.filter((name, index) => folded.indexOf(name) !== index)
}

describe('sales tax fixture', () => {
    it('names an Other current liability seed account for every agency', () => {
        for (const agency of TAX_AGENCIES) {
            const account = seedAccount(agency.account_number)
            expect(account, `${agency.name} names ${agency.account_number}`).toBeDefined()
            expect(account?.type, agency.name).toBe('other_current_liability')
        }
    })

    it('takes the sales tax account from SEED_ACCOUNTS: 2200, Sales tax payable', () => {
        expect(SALES_TAX_ACCOUNT).toBe(SEED_ACCOUNTS.find(account => account.key === 'sales-tax'))
        expect(SALES_TAX_ACCOUNT.number).toBe('2200')
        expect(SALES_TAX_ACCOUNT.name).toBe('Sales tax payable')
        expect(SALES_TAX_ACCOUNT.type).toBe('other_current_liability')
        expect(SALES_TAX_ACCOUNT.detail_type).toBe('sales_tax_payable')
    })

    it('has exactly one default, Denver combined, and it is active', () => {
        const defaults = TAX_RATE_ROWS.filter(row => row.is_default)
        expect(defaults.map(row => row.id)).toEqual([TAX_IDS.denverCombined])
        expect(defaults[0].name).toBe('Denver combined')
        expect(defaults[0].inactive).toBe(false)
    })

    it('gives every group 2 to 10 distinct active rates and no rate or agency of its own', () => {
        const groups = TAX_RATE_ROWS.filter(row => row.type === 'group')
        expect(groups.map(row => row.id)).toEqual(TAX_GROUPS.map(row => row.id))
        for (const group of groups) {
            expect(group.components.length, group.name).toBeGreaterThanOrEqual(2)
            expect(group.components.length, group.name).toBeLessThanOrEqual(10)
            expect(new Set(group.components).size, group.name).toBe(group.components.length)
            for (const id of group.components) {
                const component = TAX_RATES.find(rate => rate.id === id)
                expect(component?.type, `${group.name} names ${id}`).toBe('rate')
                expect(component?.inactive, `${group.name} names ${id}`).toBe(false)
            }
            expect(group.rate_ppm, group.name).toBe(0)
            expect(group.agency, group.name).toBe('')
        }
    })

    it('gives every rate an agency of the fixture and no components', () => {
        const rates = TAX_RATE_ROWS.filter(row => row.type === 'rate')
        expect(rates.map(row => row.id)).toEqual(TAX_RATES.map(row => row.id))
        for (const rate of rates) {
            expect(agencyById(rate.agency), `${rate.name} names ${rate.agency}`).toBeDefined()
            expect(rate.components, rate.name).toEqual([])
        }
    })

    it('holds the edge rows the screens draw', () => {
        const ppms = TAX_RATES.map(rate => rate.rate_ppm)
        expect(ppms).toContain(0)
        expect(ppms).toContain(88_750)
        expect(ppms).toContain(1_050)

        const inactiveOfActive = TAX_RATES.filter(
            rate => rate.inactive && agencyById(rate.agency)?.inactive === false
        )
        expect(inactiveOfActive.length).toBeGreaterThan(0)

        const inactiveAgencies = TAX_AGENCIES.filter(agency => agency.inactive)
        const withOneInactiveRate = inactiveAgencies.filter(agency => {
            const rates = TAX_RATES.filter(rate => rate.agency === agency.id)
            return rates.length === 1 && rates[0].name === 'Old county rate' && rates[0].inactive
        })
        expect(withOneInactiveRate).toHaveLength(1)

        const oldCombined = TAX_GROUPS.find(group => group.name === 'Old combined')
        expect(oldCombined?.inactive).toBe(true)
        for (const id of oldCombined?.components ?? []) {
            expect(TAX_RATES.find(rate => rate.id === id)?.inactive, id).toBe(false)
        }

        expect(TAX_RATES.some(rate => rate.name.length > 60)).toBe(true)
    })

    it('has names that are unique without regard to case among rates and groups, and among agencies', () => {
        expect(repeatedCaseless(TAX_RATE_ROWS.map(row => row.name))).toEqual([])
        expect(repeatedCaseless(TAX_AGENCIES.map(row => row.name))).toEqual([])
    })

    it('has ids the seed may send', () => {
        const ids = [
            ...Object.values(TAX_IDS),
            ...TAX_AGENCIES.map(row => row.id),
            ...TAX_RATE_ROWS.map(row => row.id),
        ]
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]{15}$/)
    })

    it('makes one seeded customer exempt for resale and gives another Denver combined', () => {
        const customerIds = CUSTOMERS.map(customer => customer.id)
        expect(CUSTOMER_TAX_PATCHES).toHaveLength(2)
        for (const patch of CUSTOMER_TAX_PATCHES) expect(customerIds).toContain(patch.id)

        const exempt = CUSTOMER_TAX_PATCHES.filter(patch => patch.tax_exempt)
        expect(exempt).toHaveLength(1)
        expect(exempt[0].exemption_reason).toBe('resale')
        expect(exempt[0].default_tax_rate).toBe('')

        const withDefault = CUSTOMER_TAX_PATCHES.filter(patch => !patch.tax_exempt)
        expect(withDefault).toHaveLength(1)
        expect(withDefault[0].default_tax_rate).toBe(TAX_IDS.denverCombined)
        expect(withDefault[0].id).not.toBe(exempt[0].id)
    })

    it('makes every Non-inventory product taxable and every other product not', () => {
        for (const product of PRODUCTS) {
            expect(product.taxable, `${product.name} (${product.type})`).toBe(
                product.type === 'non_inventory'
            )
        }
    })
})
