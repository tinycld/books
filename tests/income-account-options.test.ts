import { describe, expect, it } from 'vitest'
import {
    type IncomeOptionAccount,
    incomeAccountOptions,
} from '../tinycld/books/lib/income-account-options'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

// The seeded e2e book's chart plus an Other income account, an inactive Income account
// and an Income child of 4000 Consulting Income.
const ACCOUNTS: IncomeOptionAccount[] = [
    ...SEED_ACCOUNTS.map(account => ({
        id: idOf(account.number),
        name: account.name,
        number: account.number,
        type: account.type,
        parent: seedParentId(account.parent),
        inactive: account.inactive ?? false,
    })),
    {
        id: idOf('7000'),
        name: 'Interest Earned',
        number: '7000',
        type: 'other_income',
        parent: '',
        inactive: false,
    },
    {
        id: idOf('4900'),
        name: 'Old Sales',
        number: '4900',
        type: 'income',
        parent: '',
        inactive: true,
    },
    {
        id: idOf('4010'),
        name: 'Retainers',
        number: '4010',
        type: 'income',
        parent: idOf('4000'),
        inactive: false,
    },
]

describe('incomeAccountOptions', () => {
    it('offers the active Income and Other income accounts in chart order, indented by depth', () => {
        expect(incomeAccountOptions(ACCOUNTS, '').options).toEqual([
            { value: idOf('4000'), label: '4000 Consulting Income', indent: 0 },
            { value: idOf('4010'), label: '4010 Retainers', indent: 1 },
            { value: idOf('7000'), label: '7000 Interest Earned', indent: 0 },
        ])
    })

    it('names a stored inactive Income account in the trigger label', () => {
        expect(incomeAccountOptions(ACCOUNTS, idOf('4900')).triggerLabel).toBe('4900 Old Sales')
    })

    it('names a stored account that is not an income account in the trigger label', () => {
        expect(incomeAccountOptions(ACCOUNTS, idOf('6200')).triggerLabel).toBe(
            '6200 Software Subscriptions'
        )
    })

    it('leaves the trigger label empty for no account, an offered account or an unknown id', () => {
        expect(incomeAccountOptions(ACCOUNTS, '').triggerLabel).toBe('')
        expect(incomeAccountOptions(ACCOUNTS, idOf('4010')).triggerLabel).toBe('')
        expect(incomeAccountOptions(ACCOUNTS, 'nosuchaccount00').triggerLabel).toBe('')
    })
})
