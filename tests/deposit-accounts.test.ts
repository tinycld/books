import { describe, expect, it } from 'vitest'
import {
    bankAccountOptions,
    type DepositAccountRow,
    defaultBankAccount,
    defaultDepositAccount,
    depositAccountOptions,
    otherFundsAccountOptions,
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

// The Other funds Account chart (bank deposit spec §3.5): out of chart order, with the
// Deposit to account, a second bank account, Accounts receivable, Undeposited funds,
// Accounts payable, income and expense accounts, a sub-account and an inactive expense.
function account(
    fields: Pick<DepositAccountRow, 'id' | 'number' | 'name' | 'type'> & Partial<DepositAccountRow>
): DepositAccountRow {
    return { detail_type: '', parent: '', inactive: false, ...fields }
}

const LINE_ACCOUNT = {
    checking: account({ id: 'acctlinecheck01', number: '1000', name: 'Checking', type: 'bank' }),
    savings: account({ id: 'acctlinesave001', number: '1010', name: 'Savings', type: 'bank' }),
    receivable: account({
        id: 'acctlinear00001',
        number: '1100',
        name: 'Accounts receivable',
        type: 'accounts_receivable',
    }),
    undeposited: account({
        id: 'acctlineundep01',
        number: '1200',
        name: 'Undeposited funds',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
    }),
    payable: account({
        id: 'acctlineap00001',
        number: '2000',
        name: 'Accounts payable',
        type: 'accounts_payable',
    }),
    interest: account({
        id: 'acctlineint0001',
        number: '4900',
        name: 'Interest earned',
        type: 'other_income',
    }),
    fees: account({
        id: 'acctlinefees001',
        number: '6300',
        name: 'Bank charges and fees',
        type: 'expense',
    }),
    wire: account({
        id: 'acctlinewire001',
        number: '6310',
        name: 'Wire fees',
        type: 'expense',
        parent: 'acctlinefees001',
    }),
    oldFees: account({
        id: 'acctlineold0001',
        number: '6900',
        name: 'Old bank fees',
        type: 'expense',
        inactive: true,
    }),
}

const LINE_CHART: DepositAccountRow[] = [
    LINE_ACCOUNT.fees,
    LINE_ACCOUNT.payable,
    LINE_ACCOUNT.oldFees,
    LINE_ACCOUNT.interest,
    LINE_ACCOUNT.checking,
    LINE_ACCOUNT.wire,
    LINE_ACCOUNT.undeposited,
    LINE_ACCOUNT.receivable,
    LINE_ACCOUNT.savings,
]

describe('otherFundsAccountOptions', () => {
    const labelsOf = (depositTo: string, stored = '') =>
        otherFundsAccountOptions(LINE_CHART, depositTo, stored).options.map(option => option.label)

    it('offers every active account but AR, AP and Deposit to, in chart order, as "<number> <name>"', () => {
        expect(labelsOf(LINE_ACCOUNT.checking.id)).toEqual([
            '1010 Savings',
            '1200 Undeposited funds',
            '4900 Interest earned',
            '6300 Bank charges and fees',
            '6310 Wire fees',
        ])
    })

    it('leaves out Accounts receivable and Accounts payable', () => {
        const values = otherFundsAccountOptions(
            LINE_CHART,
            LINE_ACCOUNT.checking.id,
            ''
        ).options.map(option => option.value)
        expect(values).not.toContain(LINE_ACCOUNT.receivable.id)
        expect(values).not.toContain(LINE_ACCOUNT.payable.id)
    })

    it('leaves out the account chosen in Deposit to, whichever it is', () => {
        expect(labelsOf(LINE_ACCOUNT.checking.id)).not.toContain('1000 Checking')
        expect(labelsOf(LINE_ACCOUNT.savings.id)).toContain('1000 Checking')
        expect(labelsOf(LINE_ACCOUNT.savings.id)).not.toContain('1010 Savings')
    })

    it('leaves out an inactive account', () => {
        expect(labelsOf(LINE_ACCOUNT.checking.id)).not.toContain('6900 Old bank fees')
    })

    it('keeps a stored inactive account once, for the line that stored it', () => {
        const { options, triggerLabel } = otherFundsAccountOptions(
            LINE_CHART,
            LINE_ACCOUNT.checking.id,
            LINE_ACCOUNT.oldFees.id
        )
        const named = [...options.map(option => option.label), triggerLabel].filter(
            label => label === '6900 Old bank fees'
        )
        expect(named).toHaveLength(1)
        // Another line, which stored no inactive account, is not offered it.
        expect(labelsOf(LINE_ACCOUNT.checking.id, LINE_ACCOUNT.interest.id)).not.toContain(
            '6900 Old bank fees'
        )
    })

    it('names an offered stored account by its option, not again in the trigger', () => {
        const { options, triggerLabel } = otherFundsAccountOptions(
            LINE_CHART,
            LINE_ACCOUNT.checking.id,
            LINE_ACCOUNT.interest.id
        )
        expect(options.filter(option => option.value === LINE_ACCOUNT.interest.id)).toHaveLength(1)
        expect(triggerLabel).toBe('')
    })

    it('offers nothing for an empty chart', () => {
        expect(otherFundsAccountOptions([], '', '').options).toEqual([])
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
