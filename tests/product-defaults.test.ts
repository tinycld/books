import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_FIELDS } from '../tinycld/books/lib/product-columns'
import {
    type DefaultAccount,
    defaultExpenseAccount,
    defaultIncomeAccount,
    newProductValues,
} from '../tinycld/books/lib/product-defaults'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

// The seeded e2e book's chart: one Income account (4000, service_income), no Cost of
// goods sold account.
const SEED: DefaultAccount[] = SEED_ACCOUNTS.map(account => ({
    id: idOf(account.number),
    name: account.name,
    number: account.number,
    type: account.type,
    detail_type: account.detail_type,
    parent: seedParentId(account.parent),
    inactive: account.inactive ?? false,
}))

function account(
    number: string,
    name: string,
    type: DefaultAccount['type'],
    detail_type: string,
    inactive = false
): DefaultAccount {
    return { id: idOf(number), name, number, type, detail_type, parent: '', inactive }
}

const PRODUCT_SALES = account('4100', 'Product Sales', 'income', 'product_sales')
const RETAINERS = account('4050', 'Retainers', 'income', 'service_income', true)
const COST_OF_GOODS = account(
    '5000',
    'Cost of Goods',
    'cost_of_goods_sold',
    'supplies_materials_cogs'
)
const FREIGHT_IN = account(
    '5100',
    'Freight In',
    'cost_of_goods_sold',
    'shipping_freight_delivery_cos'
)

const ACCOUNTS = [...SEED, PRODUCT_SALES, RETAINERS, COST_OF_GOODS, FREIGHT_IN]

const without = (accounts: readonly DefaultAccount[], ...numbers: string[]) =>
    accounts.filter(a => !numbers.includes(a.number))

describe('defaultIncomeAccount', () => {
    it('is the first active Service income account for a service', () => {
        expect(defaultIncomeAccount(ACCOUNTS, 'service')).toBe(idOf('4000'))
    })

    it('skips an inactive Service income account and falls back to the first active Income account', () => {
        expect(defaultIncomeAccount(without(ACCOUNTS, '4000'), 'service')).toBe(idOf('4100'))
    })

    it('is the first active Product sales account for a non-inventory item', () => {
        expect(defaultIncomeAccount(ACCOUNTS, 'non_inventory')).toBe(idOf('4100'))
    })

    it('is the first active Income account when there is no Product sales account', () => {
        expect(defaultIncomeAccount(without(ACCOUNTS, '4100'), 'non_inventory')).toBe(idOf('4000'))
    })

    it('is empty when there is no Income account', () => {
        const noIncome = without(ACCOUNTS, '4000', '4050', '4100')
        expect(defaultIncomeAccount(noIncome, 'service')).toBe('')
        expect(defaultIncomeAccount(noIncome, 'non_inventory')).toBe('')
    })

    it('is empty for a bundle', () => {
        expect(defaultIncomeAccount(ACCOUNTS, 'bundle')).toBe('')
    })
})

describe('defaultExpenseAccount', () => {
    it('is the first active Cost of goods sold account in chart order', () => {
        expect(defaultExpenseAccount(ACCOUNTS)).toBe(idOf('5000'))
    })

    it('is empty when there is no Cost of goods sold account', () => {
        expect(defaultExpenseAccount(SEED)).toBe('')
    })

    it('skips an inactive Cost of goods sold account', () => {
        const accounts = ACCOUNTS.map(a => (a.number === '5000' ? { ...a, inactive: true } : a))
        expect(defaultExpenseAccount(accounts)).toBe(idOf('5100'))
    })
})

describe('newProductValues', () => {
    it('starts a bundle with both accounts empty', () => {
        expect(newProductValues('bundle', ACCOUNTS)).toEqual({
            ...EMPTY_PRODUCT_FIELDS,
            type: 'bundle',
            income_account: '',
            expense_account: '',
        })
    })

    it('starts a service in the seeded book with 4000 Consulting Income and no expense account', () => {
        const values = newProductValues('service', SEED)
        expect(values).toEqual({
            ...EMPTY_PRODUCT_FIELDS,
            type: 'service',
            income_account: idOf('4000'),
            expense_account: '',
        })
        expect(values.price).toBe(0)
        expect(values.purchases).toBe(false)
    })

    it('starts a non-inventory item with both defaults', () => {
        expect(newProductValues('non_inventory', ACCOUNTS)).toEqual({
            ...EMPTY_PRODUCT_FIELDS,
            type: 'non_inventory',
            income_account: idOf('4100'),
            expense_account: idOf('5000'),
        })
    })
})
