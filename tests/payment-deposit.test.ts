import { describe, expect, it } from 'vitest'
import type { DepositAccountRow } from '../tinycld/books/lib/deposit-accounts'
import { paymentDefaultDeposit, paymentDepositOptions } from '../tinycld/books/lib/payment-deposit'
import { DEPOSIT_ACCOUNT_IDS, DEPOSIT_ACCOUNTS } from '../tinycld/books/lib/receive-payment-fixture'

// Deposit to of a payment (spec §3.2, Q6): active bank and Undeposited funds accounts in
// chart order; when no active Undeposited funds account exists the list starts with the
// option the server fills at posting, and that option is the default.

const CREATED_ON_POST = { value: '', label: 'Undeposited funds (created when you post)' }

// The e2e book's deposit accounts as full rows: top-level and active.
const SEEDED: DepositAccountRow[] = DEPOSIT_ACCOUNTS.map(row => ({
    ...row,
    parent: '',
    inactive: false,
}))
const [CHECKING, SAVINGS, UNDEPOSITED] = SEEDED

const INACTIVE_BANK: DepositAccountRow = {
    id: 'acctoldcheck001',
    number: '1020',
    name: 'Old Checking',
    type: 'bank',
    detail_type: 'checking',
    parent: '',
    inactive: true,
}

const INCOME: DepositAccountRow = {
    id: 'acctconsult0001',
    number: '4000',
    name: 'Consulting Income',
    type: 'income',
    detail_type: 'service_income',
    parent: '',
    inactive: false,
}

// Out of chart order, so the order comes from the chart.
const CHART = [INCOME, UNDEPOSITED, SAVINGS, CHECKING]
const NO_UNDEPOSITED = [INCOME, SAVINGS, CHECKING]
const UNDEPOSITED_INACTIVE = [INCOME, { ...UNDEPOSITED, inactive: true }, SAVINGS, CHECKING]

function pairs(accounts: readonly DepositAccountRow[], storedId = '') {
    return paymentDepositOptions(accounts, storedId).options.map(({ value, label }) => ({
        value,
        label,
    }))
}

describe('paymentDepositOptions', () => {
    it('lists the banks and 1200 in chart order with no created-on-post option', () => {
        expect(pairs(CHART)).toEqual([
            { value: DEPOSIT_ACCOUNT_IDS.checking, label: '1000 Business Checking' },
            { value: DEPOSIT_ACCOUNT_IDS.savings, label: '1010 Business Savings' },
            { value: DEPOSIT_ACCOUNT_IDS.undeposited, label: '1200 Undeposited funds' },
        ])
    })

    it('starts with the created-on-post option when the chart has no Undeposited funds account', () => {
        expect(pairs(NO_UNDEPOSITED)).toEqual([
            CREATED_ON_POST,
            { value: DEPOSIT_ACCOUNT_IDS.checking, label: '1000 Business Checking' },
            { value: DEPOSIT_ACCOUNT_IDS.savings, label: '1010 Business Savings' },
        ])
    })

    it('starts with the created-on-post option when the only Undeposited funds account is inactive', () => {
        expect(pairs(UNDEPOSITED_INACTIVE)).toEqual([
            CREATED_ON_POST,
            { value: DEPOSIT_ACCOUNT_IDS.checking, label: '1000 Business Checking' },
            { value: DEPOSIT_ACCOUNT_IDS.savings, label: '1010 Business Savings' },
        ])
    })

    it('lists only the created-on-post option with no bank and no Undeposited funds account', () => {
        expect(pairs([INCOME])).toEqual([CREATED_ON_POST])
        expect(pairs([])).toEqual([CREATED_ON_POST])
    })

    it('names a stored inactive bank account in the trigger only', () => {
        const { options, triggerLabel } = paymentDepositOptions(
            [...CHART, INACTIVE_BANK],
            INACTIVE_BANK.id
        )
        expect(triggerLabel).toContain('Old Checking')
        expect(options.map(option => option.value)).not.toContain(INACTIVE_BANK.id)
    })
})

describe('paymentDefaultDeposit', () => {
    it('is the active Undeposited funds account', () => {
        expect(paymentDefaultDeposit(CHART)).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
    })

    it('is empty, never a bank, when no active Undeposited funds account exists', () => {
        expect(paymentDefaultDeposit(NO_UNDEPOSITED)).toBe('')
        expect(paymentDefaultDeposit(UNDEPOSITED_INACTIVE)).toBe('')
        expect(paymentDefaultDeposit([])).toBe('')
    })
})
