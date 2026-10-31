// The 1099-NEC and 1099-MISC boxes an expense account can report to. The keys
// must equal the form_1099_box values of migration 2100000002 and boxes1099 in
// server/form1099.go; tests/form-1099.test.ts and the Go test check both, so
// a box added in one place and not the others fails a test.

import type { BooksAccounts } from '../types'

export type Box1099Key = Exclude<BooksAccounts['form_1099_box'], ''>

export const BOXES_1099 = [
    { key: 'nec_1', form: 'NEC', box: 1, label: 'Nonemployee compensation' },
    { key: 'misc_1', form: 'MISC', box: 1, label: 'Rents' },
    { key: 'misc_2', form: 'MISC', box: 2, label: 'Royalties' },
    { key: 'misc_3', form: 'MISC', box: 3, label: 'Other income' },
    { key: 'misc_5', form: 'MISC', box: 5, label: 'Fishing boat proceeds' },
    { key: 'misc_6', form: 'MISC', box: 6, label: 'Medical and health care payments' },
    {
        key: 'misc_8',
        form: 'MISC',
        box: 8,
        label: 'Substitute payments in lieu of dividends or interest',
    },
    { key: 'misc_9', form: 'MISC', box: 9, label: 'Crop insurance proceeds' },
    { key: 'misc_10', form: 'MISC', box: 10, label: 'Gross proceeds paid to an attorney' },
    { key: 'misc_11', form: 'MISC', box: 11, label: 'Fish purchased for resale' },
] as const satisfies readonly {
    key: Box1099Key
    form: 'NEC' | 'MISC'
    box: number
    label: string
}[]

// A tuple literal, so z.enum can take it.
export const BOX_1099_KEYS = [
    'nec_1',
    'misc_1',
    'misc_2',
    'misc_3',
    'misc_5',
    'misc_6',
    'misc_8',
    'misc_9',
    'misc_10',
    'misc_11',
] as const satisfies readonly Box1099Key[]

export const NOT_REPORTED = 'Not reported'

export function box1099Label(key: string): string {
    if (key === '') return NOT_REPORTED
    const box = BOXES_1099.find(entry => entry.key === key)
    if (!box) return ''
    return `${box.form} ${box.box} · ${box.label}`
}

export function box1099Options(): { value: Box1099Key | ''; label: string }[] {
    return [
        { value: '', label: NOT_REPORTED },
        ...BOXES_1099.map(box => ({ value: box.key, label: box1099Label(box.key) })),
    ]
}

export const EXPENSE_GROUP_TYPES = [
    'cost_of_goods_sold',
    'expense',
    'other_expense',
] as const satisfies readonly BooksAccounts['type'][]

export function isExpenseGroupType(type: string): boolean {
    return EXPENSE_GROUP_TYPES.some(groupType => groupType === type)
}
