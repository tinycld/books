import { describe, expect, it } from 'vitest'
import type { FilterSpec } from '../tinycld/books/lib/report-definition'
import {
    ACCOUNT_GROUP_CHOICES,
    accountGroupOf,
    filterChipValue,
    hasActiveFilters,
    inactiveFilters,
    withoutFilter,
} from '../tinycld/books/lib/report-filters'
import { REPORT_ACCOUNTS } from '../tinycld/books/lib/report-shell-fixture'

const ACCOUNT_FILTER: FilterSpec = { id: 'account', label: 'Account', kind: 'accounts' }

const STATUS_FILTER: FilterSpec = {
    id: 'status',
    label: 'Status',
    kind: 'choice',
    options: [
        { id: 'open', label: 'Open' },
        { id: 'paid', label: 'Paid' },
    ],
}

const VENDOR_FILTER: FilterSpec = { id: 'vendor', label: 'Vendor', kind: 'accounts' }

const INACTIVE_ACCOUNT = {
    ...REPORT_ACCOUNTS[0],
    id: 'rpt_acct_1030',
    number: '1030',
    name: 'Old petty cash',
    inactive: true,
}

// The names map holds every account, active or not.
const NAMES: ReadonlyMap<string, string> = new Map(
    [...REPORT_ACCOUNTS, INACTIVE_ACCOUNT].map(a => [a.id, `${a.number} ${a.name}`])
)

describe('account group choices', () => {
    it('lists the five groups with their labels, in order', () => {
        expect(ACCOUNT_GROUP_CHOICES).toEqual([
            { id: 'group:asset', label: 'All asset accounts' },
            { id: 'group:liability', label: 'All liability accounts' },
            { id: 'group:equity', label: 'All equity accounts' },
            { id: 'group:income', label: 'All income accounts' },
            { id: 'group:expense', label: 'All expense accounts' },
        ])
    })

    it('reads the group of a group value and null for anything else', () => {
        expect(accountGroupOf('group:income')).toBe('income')
        expect(accountGroupOf('group:asset')).toBe('asset')
        expect(accountGroupOf('rpt_acct_1010')).toBeNull()
        expect(accountGroupOf('group:nope')).toBeNull()
    })
})

describe('filterChipValue', () => {
    it('words the account filter chip', () => {
        expect(filterChipValue(ACCOUNT_FILTER, ['rpt_acct_1010'], NAMES)).toBe(
            '1010 Operating checking'
        )
        expect(INACTIVE_ACCOUNT.inactive).toBe(true)
        expect(filterChipValue(ACCOUNT_FILTER, ['rpt_acct_1030'], NAMES)).toBe(
            '1030 Old petty cash'
        )
        expect(filterChipValue(ACCOUNT_FILTER, ['group:income'], NAMES)).toBe('All income accounts')
        expect(
            filterChipValue(
                ACCOUNT_FILTER,
                ['rpt_acct_1010', 'rpt_acct_1020', 'rpt_acct_4000'],
                NAMES
            )
        ).toBe('3 accounts')
        expect(filterChipValue(ACCOUNT_FILTER, ['rpt_acct_1010', 'group:income'], NAMES)).toBe(
            '2 selections'
        )
        expect(filterChipValue(ACCOUNT_FILTER, ['rpt_acct_missing'], NAMES)).toBe('1 account')
    })

    it('words the choice filter chip', () => {
        expect(filterChipValue(STATUS_FILTER, ['paid'], NAMES)).toBe('Paid')
        expect(filterChipValue(STATUS_FILTER, ['open', 'paid'], NAMES)).toBe('2 selections')
    })

    it('words an unknown choice value by its kind, never as an account', () => {
        expect(filterChipValue(STATUS_FILTER, ['unknown'], NAMES)).toBe('1 selection')
        expect(filterChipValue(STATUS_FILTER, ['group:income'], NAMES)).toBe('1 selection')
        expect(NAMES.get('rpt_acct_1010')).toBe('1010 Operating checking')
        expect(filterChipValue(STATUS_FILTER, ['rpt_acct_1010'], NAMES)).toBe('1 selection')
    })
})

describe('filter state helpers', () => {
    it('counts a filter as active only when it has a value', () => {
        expect(hasActiveFilters({})).toBe(false)
        expect(hasActiveFilters({ account: [] })).toBe(false)
        expect(hasActiveFilters({ account: ['a1'] })).toBe(true)
    })

    it('removes only the named filter', () => {
        const filters = { account: ['a1'], status: ['open'] }
        expect(withoutFilter(filters, 'account')).toEqual({ status: ['open'] })
        expect(filters).toEqual({ account: ['a1'], status: ['open'] })
    })

    it('returns the specs with no values, in spec order', () => {
        expect(
            inactiveFilters([ACCOUNT_FILTER, STATUS_FILTER, VENDOR_FILTER], {
                status: ['open'],
                account: [],
            })
        ).toEqual([ACCOUNT_FILTER, VENDOR_FILTER])
    })
})
