import { describe, expect, it } from 'vitest'
import {
    ASSET_ACCOUNT_DEFAULT_LABEL,
    type AssetOptionAccount,
    assetAccountOptions,
    assetAccountPlaceholder,
    COGS_ACCOUNT_DEFAULT_LABEL,
    cogsAccountOptions,
    cogsAccountPlaceholder,
} from '../tinycld/books/lib/inventory-account-options'

const account = (
    number: string,
    name: string,
    type: AssetOptionAccount['type'],
    rest: Partial<AssetOptionAccount> = {}
): AssetOptionAccount => ({
    id: `acc-${number}`,
    name,
    number,
    type,
    parent: '',
    inactive: false,
    ...rest,
})

// A chart with three active Other current asset accounts (one a child of Inventory
// asset), an inactive one, and accounts of other types.
const ACCOUNTS: AssetOptionAccount[] = [
    account('1000', 'Business Checking', 'bank'),
    account('1200', 'Prepaid expenses', 'other_current_asset'),
    account('1300', 'Inventory asset', 'other_current_asset'),
    account('1310', 'Raw materials', 'other_current_asset', { parent: 'acc-1300' }),
    account('1390', 'Old stock', 'other_current_asset', { inactive: true }),
    account('1500', 'Equipment', 'fixed_asset'),
    account('5000', 'Cost of goods sold', 'cost_of_goods_sold'),
    account('5010', 'Freight in', 'cost_of_goods_sold', { parent: 'acc-5000' }),
    account('5900', 'Old cost account', 'cost_of_goods_sold', { inactive: true }),
    account('6000', 'Operating expenses', 'expense'),
]

describe('assetAccountOptions', () => {
    it('offers the active Other current asset accounts in chart order, a child indented', () => {
        const { options, triggerLabel } = assetAccountOptions(ACCOUNTS, '')
        expect(options.map(option => [option.value, option.indent ?? 0])).toEqual([
            ['acc-1200', 0],
            ['acc-1300', 0],
            ['acc-1310', 1],
        ])
        expect(triggerLabel).toBe('')
    })

    it('offers no "None": the server gives an item with no account the chart\'s', () => {
        const { options } = assetAccountOptions(ACCOUNTS, '')
        expect(options.some(option => option.value === '')).toBe(false)
    })

    it('names a stored account that became inactive in the trigger, and does not offer it', () => {
        const { options, triggerLabel } = assetAccountOptions(ACCOUNTS, 'acc-1390')
        expect(options.some(option => option.value === 'acc-1390')).toBe(false)
        expect(triggerLabel).toContain('Old stock')
    })

    it('names a stored account of another type in the trigger, and does not offer it', () => {
        const { options, triggerLabel } = assetAccountOptions(ACCOUNTS, 'acc-1500')
        expect(options.some(option => option.value === 'acc-1500')).toBe(false)
        expect(triggerLabel).toContain('Equipment')
    })

    it('has no trigger label for a stored account it offers', () => {
        expect(assetAccountOptions(ACCOUNTS, 'acc-1300').triggerLabel).toBe('')
    })
})

describe('cogsAccountOptions', () => {
    it('offers the active Cost of goods sold accounts alone, a child indented, with no None', () => {
        const { options, triggerLabel } = cogsAccountOptions(ACCOUNTS, '')
        expect(options.map(option => [option.value, option.indent ?? 0])).toEqual([
            ['acc-5000', 0],
            ['acc-5010', 1],
        ])
        expect(triggerLabel).toBe('')
    })

    it('names a stored account it does not offer: an inactive one, an expense account', () => {
        expect(cogsAccountOptions(ACCOUNTS, 'acc-5900').triggerLabel).toContain('Old cost account')
        const expense = cogsAccountOptions(ACCOUNTS, 'acc-6000')
        expect(expense.options.some(option => option.value === 'acc-6000')).toBe(false)
        expect(expense.triggerLabel).toContain('Operating expenses')
    })

    it('shows the name of the account the server gives an item that names none', () => {
        expect(COGS_ACCOUNT_DEFAULT_LABEL).toBe('Cost of goods sold')
        expect(cogsAccountPlaceholder('')).toBe('Cost of goods sold')
        expect(cogsAccountPlaceholder('5900 Old cost account')).toBe('5900 Old cost account')
    })
})

describe('assetAccountPlaceholder', () => {
    it('is the name of the account the server gives an item that names none', () => {
        expect(ASSET_ACCOUNT_DEFAULT_LABEL).toBe('Inventory asset')
        expect(assetAccountPlaceholder('')).toBe('Inventory asset')
    })

    it('is the stored account that is not offered', () => {
        expect(assetAccountPlaceholder('1390 Old stock')).toBe('1390 Old stock')
    })
})
