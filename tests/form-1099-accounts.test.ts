import { describe, expect, it } from 'vitest'
import { form1099Accounts } from '../tinycld/books/lib/form-1099-accounts'
import {
    ACCOUNTS_1099,
    type Account1099Row,
    NO_EXPENSE_ACCOUNTS_1099,
} from '../tinycld/books/lib/vendor-1099-fixture'

// The fixture's accounts with the fields of the account whose key is `id` changed.
function withAccount(id: string, change: Partial<Account1099Row>): Account1099Row[] {
    expect(ACCOUNTS_1099.some(account => account.id === id)).toBe(true)
    return ACCOUNTS_1099.map(account => (account.id === id ? { ...account, ...change } : account))
}

function ids(rows: ReturnType<typeof form1099Accounts>) {
    return rows.map(row => row.id)
}

describe('form1099Accounts', () => {
    it('lists the expense-group accounts in chart order, sub-accounts after their parent', () => {
        expect(form1099Accounts(ACCOUNTS_1099)).toEqual([
            { id: 'rent', label: '6100 Rent', depth: 1, inactive: false, box: 'misc_1' },
            {
                id: 'software',
                label: '6200 Software Subscriptions',
                depth: 1,
                inactive: false,
                box: '',
            },
            {
                id: 'design-tools',
                label: '6210 Design Tools',
                depth: 2,
                inactive: false,
                box: 'nec_1',
            },
            {
                id: 'petty',
                label: '6900 Old Petty Cash',
                depth: 1,
                inactive: true,
                box: 'misc_8',
            },
        ])
    })

    it('leaves out an inactive expense account that has no box', () => {
        const rows = form1099Accounts(withAccount('petty', { form_1099_box: '' }))
        expect(ids(rows)).toEqual(['rent', 'software', 'design-tools'])
    })

    it('keeps the chart depth of an active sub-account whose inactive parent is left out', () => {
        const rows = form1099Accounts(withAccount('software', { inactive: true }))
        expect(ids(rows)).toEqual(['rent', 'design-tools', 'petty'])
        expect(rows.find(row => row.id === 'design-tools')?.depth).toBe(2)
    })

    it('leaves out a non-expense account that has a stray box', () => {
        const rows = form1099Accounts(withAccount('consulting', { form_1099_box: 'nec_1' }))
        expect(ids(rows)).not.toContain('consulting')
        expect(ids(rows)).toEqual(['rent', 'software', 'design-tools', 'petty'])
    })

    it('labels an account with no number by its name alone, trimmed', () => {
        const rows = form1099Accounts(withAccount('rent', { number: '' }))
        expect(rows.find(row => row.id === 'rent')?.label).toBe('Rent')
    })

    it('lists a held inactive account that has no box, at its chart place', () => {
        const rows = form1099Accounts(
            withAccount('petty', { form_1099_box: '' }),
            new Set(['petty'])
        )
        expect(ids(rows)).toEqual(['rent', 'software', 'design-tools', 'petty'])
        expect(rows.find(row => row.id === 'petty')).toEqual({
            id: 'petty',
            label: '6900 Old Petty Cash',
            depth: 1,
            inactive: true,
            box: '',
        })
    })

    it('leaves out an inactive account with no box when only other ids are held', () => {
        const rows = form1099Accounts(
            withAccount('petty', { form_1099_box: '' }),
            new Set(['rent', 'software'])
        )
        expect(ids(rows)).toEqual(['rent', 'software', 'design-tools'])
    })

    it('lists nothing for a book with no expense-group account', () => {
        expect(form1099Accounts(NO_EXPENSE_ACCOUNTS_1099)).toEqual([])
    })
})
