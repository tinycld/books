import { describe, expect, it } from 'vitest'
import {
    defaultLiabilityAccount,
    liabilityAccountOptions,
    newSalesTaxAccount,
} from '../tinycld/books/lib/liability-accounts'
import { chartWithoutLiability, seedChart, taxAccount } from './tax-accounts'

// Fictional accounts around the seeded 2200 Sales tax payable, listed out of chart order
// so the options must sort them.
const oldSalesTax = taxAccount({
    number: '2290',
    name: 'Old sales tax payable',
    type: 'other_current_liability',
    detail_type: 'sales_tax_payable',
    inactive: true,
})
const citySalesTax = taxAccount({
    number: '2210',
    name: 'City sales tax',
    type: 'other_current_liability',
    detail_type: 'sales_tax_payable',
    parent: 'acc-2200',
})
const payroll = taxAccount({
    number: '2150',
    name: 'Payroll liabilities',
    type: 'other_current_liability',
    detail_type: 'payroll_tax_payable',
})

const chart = [...seedChart(), oldSalesTax, citySalesTax, payroll]

describe('liabilityAccountOptions', () => {
    it('offers exactly the active Other current liability accounts in chart order, indented by depth', () => {
        expect(liabilityAccountOptions(chart, '').options).toEqual([
            { value: 'acc-2150', label: '2150 Payroll liabilities', indent: 0 },
            { value: 'acc-2200', label: '2200 Sales tax payable', indent: 0 },
            { value: 'acc-2210', label: '2210 City sales tax', indent: 1 },
        ])
    })

    it('names a stored inactive liability account in the trigger and does not offer it', () => {
        const { options, triggerLabel } = liabilityAccountOptions(chart, 'acc-2290')
        expect(options.map(option => option.value)).not.toContain('acc-2290')
        expect(triggerLabel).toBe('2290 Old sales tax payable')
    })

    it('gives no trigger label for a stored account it offers', () => {
        expect(liabilityAccountOptions(chart, 'acc-2200').triggerLabel).toBe('')
    })
})

describe('defaultLiabilityAccount', () => {
    it('picks the Sales tax payable account over an earlier-numbered liability of another detail type', () => {
        expect(defaultLiabilityAccount(chart)).toBe('acc-2200')
    })

    it("is '' when no offered account has the Sales tax payable detail type", () => {
        // 2290 has that detail type but is inactive, so it is not offered.
        expect(defaultLiabilityAccount([...chartWithoutLiability(), payroll, oldSalesTax])).toBe('')
        expect(defaultLiabilityAccount(chartWithoutLiability())).toBe('')
    })
})

describe('newSalesTaxAccount', () => {
    it('numbers the new account 2200 when no account has that number', () => {
        expect(newSalesTaxAccount(chartWithoutLiability())).toEqual({
            name: 'Sales tax payable',
            number: '2200',
            type: 'other_current_liability',
            detail_type: 'sales_tax_payable',
        })
    })

    it('leaves the number blank when an active account of another type has 2200', () => {
        const shipping = taxAccount({
            number: '2200',
            name: 'Shipping supplies',
            type: 'expense',
            detail_type: 'supplies_materials',
        })
        expect(newSalesTaxAccount([...chartWithoutLiability(), shipping])).toEqual({
            name: 'Sales tax payable',
            number: '',
            type: 'other_current_liability',
            detail_type: 'sales_tax_payable',
        })
    })

    it('leaves the number blank when an inactive account has 2200', () => {
        const retired = taxAccount({
            number: '2200',
            name: 'Retired liability',
            type: 'other_current_liability',
            detail_type: 'other_current_liabilities',
            inactive: true,
        })
        expect(newSalesTaxAccount([...chartWithoutLiability(), retired]).number).toBe('')
    })
})
