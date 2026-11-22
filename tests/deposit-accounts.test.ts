import { describe, expect, it } from 'vitest'
import {
    bankAccountOptions,
    type DepositAccountRow,
    defaultBankAccount,
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

// A bank sub-account under Business Checking: offered indented one step.
const SUB_BANK: DepositAccountRow = {
    id: 'acctpettycash01',
    number: '1005',
    name: 'Petty cash drawer',
    type: 'bank',
    detail_type: 'cash_on_hand',
    parent: DEPOSIT_ACCOUNT_IDS.checking,
    inactive: false,
}

// The Deposit to chart: out of chart order, with an inactive bank, a sub-account, the
// Undeposited funds account and an income account.
const BANK_CHART: DepositAccountRow[] = [
    INCOME,
    SEEDED[2],
    INACTIVE_BANK,
    SEEDED[1],
    SUB_BANK,
    SEEDED[0],
]

describe('bankAccountOptions', () => {
    it('offers only the active bank accounts, in chart order, as "<number> <name>"', () => {
        const { options } = bankAccountOptions(BANK_CHART, '')
        expect(options.map(option => option.label)).toEqual([
            '1000 Business Checking',
            '1005 Petty cash drawer',
            '1010 Business Savings',
        ])
        expect(options.map(option => option.value)).toEqual([
            DEPOSIT_ACCOUNT_IDS.checking,
            SUB_BANK.id,
            DEPOSIT_ACCOUNT_IDS.savings,
        ])
    })

    it('indents a sub-account by its depth', () => {
        const { options } = bankAccountOptions(BANK_CHART, '')
        const indentOf = (value: string) => options.find(option => option.value === value)?.indent
        expect(indentOf(DEPOSIT_ACCOUNT_IDS.checking)).toBe(0)
        expect(indentOf(SUB_BANK.id)).toBe(1)
        expect(indentOf(DEPOSIT_ACCOUNT_IDS.savings)).toBe(0)
    })

    it('keeps a stored inactive bank account once, by name in the trigger, never as an option', () => {
        const { options, triggerLabel } = bankAccountOptions(BANK_CHART, INACTIVE_BANK.id)
        expect(triggerLabel).toBe('1020 Old Checking')
        expect(options.map(option => option.value)).not.toContain(INACTIVE_BANK.id)
        expect(options.map(option => option.label).join(' ')).not.toContain('Old Checking')
    })

    it('offers nothing for a chart with no bank account', () => {
        const noBank = BANK_CHART.filter(row => row.type !== 'bank')
        expect(bankAccountOptions(noBank, '').options).toEqual([])
        expect(bankAccountOptions([], '').options).toEqual([])
    })
})

describe('defaultBankAccount', () => {
    it('is the first active bank account in chart order', () => {
        expect(defaultBankAccount(BANK_CHART)).toBe(DEPOSIT_ACCOUNT_IDS.checking)
    })

    it('skips an inactive bank account', () => {
        const inactiveFirst = [{ ...INACTIVE_BANK, number: '0900' }, SEEDED[1]].filter(
            row => row !== undefined
        )
        expect(defaultBankAccount(inactiveFirst)).toBe(DEPOSIT_ACCOUNT_IDS.savings)
    })

    it('is empty when the chart has no bank account', () => {
        expect(defaultBankAccount(BANK_CHART.filter(row => row.type !== 'bank'))).toBe('')
        expect(defaultBankAccount([])).toBe('')
    })
})

describe('paymentText', () => {
    it('joins the method, the reference and the deposit account', () => {
        expect(
            paymentText({
                method: 'check',
                reference: '43567',
                depositLabel: '1010 Business Savings',
                verb: 'deposited to',
            })
        ).toBe('Check · 43567 · deposited to 1010 Business Savings')
    })

    it('leaves out a missing method', () => {
        expect(
            paymentText({
                method: '',
                reference: '43567',
                depositLabel: '1010 Business Savings',
                verb: 'deposited to',
            })
        ).toBe('43567 · deposited to 1010 Business Savings')
    })

    it('is only the deposit account with no method and no reference', () => {
        expect(
            paymentText({
                method: '',
                reference: '',
                depositLabel: '1010 Business Savings',
                verb: 'deposited to',
            })
        ).toBe('deposited to 1010 Business Savings')
    })

    // The bill payment's and the expense's read views name no account in the line (they
    // show it on its own), so their present sentence is the method and the reference.
    it('gives the bill payment’s and the expense’s sentence for "paid from"', () => {
        expect(
            paymentText({ method: 'check', reference: '1001', depositLabel: '', verb: 'paid from' })
        ).toBe('Check · 1001')
        expect(
            paymentText({ method: '', reference: '', depositLabel: '', verb: 'paid from' })
        ).toBe('')
    })

    it('names the refund account after "refunded to"', () => {
        expect(
            paymentText({
                method: 'check',
                reference: '20417',
                depositLabel: '1010 Business checking',
                verb: 'refunded to',
            })
        ).toBe('Check · 20417 · refunded to 1010 Business checking')
    })

    it('puts the verb it is given before the account', () => {
        expect(
            paymentText({
                method: '',
                reference: '',
                depositLabel: '1000 Business Checking',
                verb: 'paid from',
            })
        ).toBe('paid from 1000 Business Checking')
    })
})
