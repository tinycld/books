import { describe, expect, it } from 'vitest'
import {
    type ExpenseOptionAccount,
    expenseAccountOptions,
} from '../tinycld/books/lib/expense-account-options'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

// The seeded e2e book's chart, with ids and parents, plus an Accounts payable account
// (the seed has none) so both refused types are present.
const ACCOUNTS: ExpenseOptionAccount[] = [
    ...SEED_ACCOUNTS.map(account => ({
        id: idOf(account.number),
        name: account.name,
        number: account.number,
        type: account.type,
        parent: seedParentId(account.parent),
        inactive: account.inactive ?? false,
    })),
    {
        id: idOf('2000'),
        name: 'Accounts payable',
        number: '2000',
        type: 'accounts_payable',
        parent: '',
        inactive: false,
    },
]

const NEVER_OFFERED = ['1100 Accounts receivable', '2000 Accounts payable', '6900 Old Petty Cash']

describe('expenseAccountOptions', () => {
    it('offers None, then the active accounts in chart order, labelled number name with an indent', () => {
        const { options } = expenseAccountOptions(ACCOUNTS, '')
        expect(options).toEqual([
            { value: '', label: 'None' },
            { value: idOf('1000'), label: '1000 Business Checking', indent: 0 },
            { value: idOf('1500'), label: '1500 Office Equipment', indent: 0 },
            { value: idOf('2100'), label: '2100 Company Card', indent: 0 },
            { value: idOf('3000'), label: "3000 Owner's Equity", indent: 0 },
            { value: idOf('4000'), label: '4000 Consulting Income', indent: 0 },
            { value: idOf('6100'), label: '6100 Rent', indent: 0 },
            { value: idOf('6200'), label: '6200 Software Subscriptions', indent: 0 },
            { value: idOf('6210'), label: '6210 Design Tools', indent: 1 },
        ])
    })

    it('puts 6210 Design Tools, one level in, right under 6200 Software Subscriptions', () => {
        const { options } = expenseAccountOptions(ACCOUNTS, '')
        const parentAt = options.findIndex(o => o.label === '6200 Software Subscriptions')
        expect(parentAt).toBeGreaterThan(0)
        expect(options[parentAt + 1]).toEqual({
            value: idOf('6210'),
            label: '6210 Design Tools',
            indent: 1,
        })
    })

    for (const storedId of ['', idOf('6900'), idOf('1100'), idOf('2000'), idOf('6100')]) {
        it(`never offers Accounts receivable, Accounts payable or an inactive account (stored "${storedId}")`, () => {
            const labels = expenseAccountOptions(ACCOUNTS, storedId).options.map(o => o.label)
            for (const label of NEVER_OFFERED) expect(labels).not.toContain(label)
        })
    }

    it('names a stored inactive account in the trigger label', () => {
        expect(expenseAccountOptions(ACCOUNTS, idOf('6900')).triggerLabel).toBe(
            '6900 Old Petty Cash'
        )
    })

    for (const [number, label] of [
        ['2000', '2000 Accounts payable'],
        ['1100', '1100 Accounts receivable'],
    ] as const) {
        it(`names a stored ${label} account, which is not offered, in the trigger label`, () => {
            expect(expenseAccountOptions(ACCOUNTS, idOf(number)).triggerLabel).toBe(label)
        })
    }

    it('leaves the trigger label empty for no account, an offered account or an unknown id', () => {
        expect(expenseAccountOptions(ACCOUNTS, '').triggerLabel).toBe('')
        expect(expenseAccountOptions(ACCOUNTS, idOf('6100')).triggerLabel).toBe('')
        expect(expenseAccountOptions(ACCOUNTS, 'nosuchaccount00').triggerLabel).toBe('')
    })
})
