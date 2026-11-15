import { describe, expect, it } from 'vitest'
import { defaultMethodFor as fixtureDefaultMethodFor } from '../tinycld/books/lib/expense-form-fixture'
import {
    defaultMethodFor,
    isPaidFromAccount,
    PAID_FROM_EMPTY_TEXT,
    PAID_FROM_TYPES,
    paidFromOptions,
} from '../tinycld/books/lib/paid-from'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

// Where an expense's money comes from (spec §3.3, Paid from): the accounts the select
// offers, the label of a stored account it no longer offers, and the payment method a
// pick sets.

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

// The seeded e2e book's chart as account rows.
const SEEDED = SEED_ACCOUNTS.map(account => ({
    id: idOf(account.number),
    name: account.name,
    number: account.number,
    type: account.type,
    detail_type: account.detail_type,
    parent: seedParentId(account.parent),
    inactive: account.inactive ?? false,
}))

type Row = (typeof SEEDED)[number]

// A bank account that became inactive: never offered, but an expense that stored it still
// names it.
const OLD_CHECKING: Row = {
    id: 'acctoldcheck001',
    number: '1020',
    name: 'Old Checking',
    type: 'bank',
    detail_type: 'checking',
    parent: '',
    inactive: true,
}

// A sub-account of 1000 Business Checking, so the options carry the chart's depth.
const PAYROLL_CHECKING: Row = {
    id: 'acctpayroll0001',
    number: '1005',
    name: 'Payroll Checking',
    type: 'bank',
    detail_type: 'checking',
    parent: idOf('1000'),
    inactive: false,
}

// Given out of chart order, so the options' order comes from the chart, not the input.
const CHART: Row[] = [...SEEDED].reverse()

describe('paidFromOptions', () => {
    it('lists the active bank and credit card accounts of the seed chart in chart order, as "<number> <name>"', () => {
        const { options, triggerLabel } = paidFromOptions(CHART, '')
        expect(options.map(option => option.label)).toEqual([
            '1000 Business Checking',
            '1010 Business Savings',
            '2100 Company Card',
        ])
        expect(options.map(option => option.value)).toEqual([
            idOf('1000'),
            idOf('1010'),
            idOf('2100'),
        ])
        expect(options.map(option => option.indent)).toEqual([0, 0, 0])
        expect(triggerLabel).toBe('')
    })

    it('offers no receivable, Undeposited funds or fixed asset account', () => {
        const values = paidFromOptions(CHART, '').options.map(option => option.value)
        for (const number of ['1100', '1200', '1500']) {
            expect(values, number).not.toContain(idOf(number))
        }
    })

    it("gives a sub-account its depth as the option's indent, with a plain label", () => {
        const { options } = paidFromOptions([...CHART, PAYROLL_CHECKING], '')
        expect(options.map(option => [option.label, option.indent])).toEqual([
            ['1000 Business Checking', 0],
            ['1005 Payroll Checking', 1],
            ['1010 Business Savings', 0],
            ['2100 Company Card', 0],
        ])
    })

    it('leaves out an inactive bank account', () => {
        const { options, triggerLabel } = paidFromOptions([...CHART, OLD_CHECKING], '')
        expect(options.map(option => option.value)).not.toContain(OLD_CHECKING.id)
        expect(triggerLabel).toBe('')
    })

    it('names a stored inactive bank account in the trigger only, as "<number> <name>"', () => {
        const { options, triggerLabel } = paidFromOptions([...CHART, OLD_CHECKING], OLD_CHECKING.id)
        expect(triggerLabel).toBe('1020 Old Checking')
        expect(options.map(option => option.value)).not.toContain(OLD_CHECKING.id)
    })

    it('is empty for a chart with no bank or credit card account', () => {
        const noPayment = SEEDED.filter(row => row.type !== 'bank' && row.type !== 'credit_card')
        expect(paidFromOptions(noPayment, '').options).toEqual([])
        expect(PAID_FROM_EMPTY_TEXT).toBe(
            'Add a bank or credit card account to the chart of accounts'
        )
    })
})

describe('defaultMethodFor', () => {
    it('sets Credit card for a credit card account', () => {
        expect(defaultMethodFor({ type: 'credit_card', detail_type: 'credit_card' })).toBe(
            'credit_card'
        )
    })

    it('sets Cash for a Cash on hand bank account', () => {
        expect(defaultMethodFor({ type: 'bank', detail_type: 'cash_on_hand' })).toBe('cash')
    })

    it('sets Check for any other bank account', () => {
        expect(defaultMethodFor({ type: 'bank', detail_type: 'checking' })).toBe('check')
        expect(defaultMethodFor({ type: 'bank', detail_type: 'savings' })).toBe('check')
    })

    it('is the one the fixture re-exports', () => {
        expect(fixtureDefaultMethodFor).toBe(defaultMethodFor)
    })
})

describe('isPaidFromAccount', () => {
    it('is true only for an active bank or credit card account', () => {
        expect(isPaidFromAccount({ type: 'bank', inactive: false })).toBe(true)
        expect(isPaidFromAccount({ type: 'credit_card', inactive: false })).toBe(true)
        expect(isPaidFromAccount({ type: 'bank', inactive: true })).toBe(false)
        expect(isPaidFromAccount({ type: 'credit_card', inactive: true })).toBe(false)
        for (const type of ['other_current_asset', 'accounts_receivable', 'expense', 'equity']) {
            expect(isPaidFromAccount({ type, inactive: false }), type).toBe(false)
        }
    })

    it('reads its types from PAID_FROM_TYPES', () => {
        expect([...PAID_FROM_TYPES].sort()).toEqual(['bank', 'credit_card'])
    })
})
