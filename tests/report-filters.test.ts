import { describe, expect, it } from 'vitest'
import type { FilterSpec } from '../tinycld/books/lib/report-definition'
import {
    ACCOUNT_GROUP_CHOICES,
    accountGroupOf,
    filterChipValue,
    filterPickerSchema,
    hasActiveFilters,
    inactiveFilters,
    pickerRows,
    shownAccountValues,
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

describe('filterPickerSchema', () => {
    // Apply stays disabled until a value is chosen: an empty selection is not a filter.
    it('rejects an empty selection and accepts one value', () => {
        expect(filterPickerSchema.safeParse({ values: [] }).success).toBe(false)
        expect(filterPickerSchema.safeParse({ values: ['group:income'] }).success).toBe(true)
        expect(filterPickerSchema.safeParse({ values: ['rpt_acct_1010'] }).success).toBe(true)
    })
})

describe('pickerRows', () => {
    // The picker's rows: the two active accounts, in chart order, as useAccountOptions
    // offers them (plain `number name` labels; the depth is an `indent` the picker does not use).
    const CHOICES = [
        { value: 'rpt_acct_1010', label: '1010 Operating checking' },
        { value: 'rpt_acct_1020', label: '1020 Reserve savings' },
    ]
    // Every account by id, active or not: the two above and the inactive 1030 and 1040.
    const PICKER_NAMES: ReadonlyMap<string, string> = new Map([
        ['rpt_acct_1010', '1010 Operating checking'],
        ['rpt_acct_1020', '1020 Reserve savings'],
        ['rpt_acct_1030', '1030 Old petty cash'],
        ['rpt_acct_1040', '1040 Closed savings'],
    ])

    it('equals the choices, in order, with nothing selected', () => {
        expect(pickerRows(CHOICES, [], PICKER_NAMES)).toEqual(CHOICES)
    })

    it('adds a selected inactive account once, after the active rows, labelled by its name', () => {
        expect(pickerRows(CHOICES, ['rpt_acct_1030'], PICKER_NAMES)).toEqual([
            ...CHOICES,
            { value: 'rpt_acct_1030', label: '1030 Old petty cash' },
        ])
        expect(
            pickerRows(CHOICES, ['rpt_acct_1030', 'rpt_acct_1030'], PICKER_NAMES).filter(
                row => row.value === 'rpt_acct_1030'
            )
        ).toEqual([{ value: 'rpt_acct_1030', label: '1030 Old petty cash' }])
    })

    it('adds selected inactive accounts in selected order', () => {
        expect(pickerRows(CHOICES, ['rpt_acct_1040', 'rpt_acct_1030'], PICKER_NAMES)).toEqual([
            ...CHOICES,
            { value: 'rpt_acct_1040', label: '1040 Closed savings' },
            { value: 'rpt_acct_1030', label: '1030 Old petty cash' },
        ])
    })

    it('does not repeat a selected active account', () => {
        expect(pickerRows(CHOICES, ['rpt_acct_1020', 'rpt_acct_1030'], PICKER_NAMES)).toEqual([
            ...CHOICES,
            { value: 'rpt_acct_1030', label: '1030 Old petty cash' },
        ])
    })

    it('gives a selected id with no name no row', () => {
        expect(pickerRows(CHOICES, ['rpt_acct_missing'], PICKER_NAMES)).toEqual(CHOICES)
        expect(pickerRows(CHOICES, ['rpt_acct_missing', 'rpt_acct_1030'], PICKER_NAMES)).toEqual([
            ...CHOICES,
            { value: 'rpt_acct_1030', label: '1030 Old petty cash' },
        ])
    })

    it('never makes a group value an account row, even when a name matches it', () => {
        // A names map never holds a group; this one does, so only the group rule keeps it out.
        const namesWithGroup = new Map([...PICKER_NAMES, ['group:income', 'All income accounts']])
        expect(pickerRows(CHOICES, ['group:income'], namesWithGroup)).toEqual(CHOICES)
        expect(
            pickerRows(CHOICES, ['group:income', 'group:expense', 'rpt_acct_1030'], PICKER_NAMES)
        ).toEqual([...CHOICES, { value: 'rpt_acct_1030', label: '1030 Old petty cash' }])
    })

    it('leaves its inputs unchanged', () => {
        const choices = CHOICES.map(choice => ({ ...choice }))
        const selected = ['rpt_acct_1030']
        pickerRows(choices, selected, PICKER_NAMES)
        expect(choices).toEqual(CHOICES)
        expect(selected).toEqual(['rpt_acct_1030'])
    })
})

describe('shownAccountValues', () => {
    // The picker's rows: an active account, then a selected inactive one it added.
    const ROWS = [
        { value: 'rpt_acct_1010', label: '1010 Operating checking' },
        { value: 'rpt_acct_1030', label: '1030 Old petty cash' },
    ]

    it('keeps valid groups and values with a row, and drops the rest, once accounts are known', () => {
        expect(
            shownAccountValues(
                ['group:income', 'rpt_acct_1030', 'rpt_acct_gone', 'group:nope', 'rpt_acct_1010'],
                ROWS,
                true
            )
        ).toEqual(['group:income', 'rpt_acct_1030', 'rpt_acct_1010'])
    })

    it('returns every value unchanged while accounts are not known', () => {
        const values = ['rpt_acct_gone', 'group:nope', 'group:income', 'rpt_acct_1010']
        expect(shownAccountValues(values, [], false)).toEqual(values)
        expect(shownAccountValues(values, ROWS, false)).toEqual(values)
    })
})
