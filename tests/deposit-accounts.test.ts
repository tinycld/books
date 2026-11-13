import { describe, expect, it } from 'vitest'
import {
    type DepositAccountRow,
    defaultDepositAccount,
    depositAccountOptions,
    paymentText,
} from '../tinycld/books/lib/deposit-accounts'
import {
    DEPOSIT_ACCOUNT_IDS,
    DEPOSIT_ACCOUNTS,
    NO_DEPOSIT_ACCOUNTS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'

// The deposit accounts of the e2e book as full rows: top-level and active, as the seed
// makes them. The defaults come after the spread, so they never make a fixture field
// optional.
const SEEDED: DepositAccountRow[] = DEPOSIT_ACCOUNTS.map(row => ({
    ...row,
    parent: '',
    inactive: false,
}))

// A bank account that became inactive: never offered, but a receipt that stored it
// still names it.
const INACTIVE_BANK: DepositAccountRow = {
    id: 'acctoldcheck001',
    number: '1020',
    name: 'Old Checking',
    type: 'bank',
    detail_type: 'checking',
    parent: '',
    inactive: true,
}

// An income account: not where money is deposited.
const INCOME: DepositAccountRow = {
    id: 'acctconsult0001',
    number: '4000',
    name: 'Consulting Income',
    type: 'income',
    detail_type: 'service_income',
    parent: '',
    inactive: false,
}

// Given out of chart order, so the options' order comes from the chart, not the input.
const CHART: DepositAccountRow[] = [INCOME, SEEDED[2], INACTIVE_BANK, SEEDED[1], SEEDED[0]]

describe('depositAccountOptions', () => {
    it('lists every active bank and Undeposited funds account in chart order, as "<number> <name>"', () => {
        const { options } = depositAccountOptions(CHART, '')
        expect(options.map(option => option.label)).toEqual([
            '1000 Business Checking',
            '1010 Business Savings',
            '1200 Undeposited funds',
        ])
        expect(options.map(option => option.value)).toEqual([
            DEPOSIT_ACCOUNT_IDS.checking,
            DEPOSIT_ACCOUNT_IDS.savings,
            DEPOSIT_ACCOUNT_IDS.undeposited,
        ])
    })

    it('offers no inactive account and no income account', () => {
        const values = depositAccountOptions(CHART, '').options.map(option => option.value)
        expect(values).not.toContain(INACTIVE_BANK.id)
        expect(values).not.toContain(INCOME.id)
    })

    it('names a stored inactive account in the trigger only, never as an option', () => {
        const { options, triggerLabel } = depositAccountOptions(CHART, INACTIVE_BANK.id)
        expect(triggerLabel).toContain('Old Checking')
        expect(options.map(option => option.value)).not.toContain(INACTIVE_BANK.id)
        expect(options.map(option => option.label).join(' ')).not.toContain('Old Checking')
    })
})

describe('defaultDepositAccount', () => {
    it('is the first active Undeposited funds account', () => {
        expect(defaultDepositAccount(CHART)).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
    })

    it('is the first active bank account when the chart has no Undeposited funds account', () => {
        const noUndeposited = CHART.filter(row => row.id !== DEPOSIT_ACCOUNT_IDS.undeposited)
        expect(defaultDepositAccount(noUndeposited)).toBe(DEPOSIT_ACCOUNT_IDS.checking)
    })

    it('is empty when the chart has no deposit account', () => {
        expect(defaultDepositAccount(NO_DEPOSIT_ACCOUNTS)).toBe('')
    })
})

describe('paymentText', () => {
    it('joins the method, the reference and the deposit account', () => {
        expect(
            paymentText({
                method: 'check',
                reference: '43567',
                depositLabel: '1010 Business Savings',
            })
        ).toBe('Check · 43567 · deposited to 1010 Business Savings')
    })

    it('leaves out a missing method', () => {
        expect(
            paymentText({ method: '', reference: '43567', depositLabel: '1010 Business Savings' })
        ).toBe('43567 · deposited to 1010 Business Savings')
    })

    it('is only the deposit account with no method and no reference', () => {
        expect(
            paymentText({ method: '', reference: '', depositLabel: '1010 Business Savings' })
        ).toBe('deposited to 1010 Business Savings')
    })
})
