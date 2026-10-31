import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accessFromRow, type BooksLevel } from '../tinycld/books/lib/access'
import { ACCOUNT_TYPES } from '../tinycld/books/lib/account-types'
import {
    BOX_1099_KEYS,
    BOXES_1099,
    type Box1099Key,
    box1099Label,
    box1099Options,
    EXPENSE_GROUP_TYPES,
    form1099Controls,
    isExpenseGroupType,
} from '../tinycld/books/lib/form-1099'
import type { BooksAccounts } from '../tinycld/books/types'
import { fieldValues, migrationField } from './migration-field'

const LABELS = [
    'NEC 1 · Nonemployee compensation',
    'MISC 1 · Rents',
    'MISC 2 · Royalties',
    'MISC 3 · Other income',
    'MISC 5 · Fishing boat proceeds',
    'MISC 6 · Medical and health care payments',
    'MISC 8 · Substitute payments in lieu of dividends or interest',
    'MISC 9 · Crop insurance proceeds',
    'MISC 10 · Gross proceeds paid to an attorney',
    'MISC 11 · Fish purchased for resale',
]

describe('BOXES_1099', () => {
    it('labels the ten boxes in order, form and box number first', () => {
        expect(BOXES_1099.map(b => box1099Label(b.key))).toEqual(LABELS)
    })

    it('BOX_1099_KEYS are the keys of BOXES_1099', () => {
        expect([...BOX_1099_KEYS]).toEqual(BOXES_1099.map(b => b.key))
    })

    it('match the form_1099_box values of migration 2100000002', () => {
        const field = migrationField('2100000002_create_books_ledger.js', 'form_1099_box')
        expect(fieldValues(field)).toEqual([...BOX_1099_KEYS])
    })

    // tsc refuses these when the generated column loses its empty value or a box.
    it('types an empty box as the column and a box key as Box1099Key', () => {
        const none: BooksAccounts['form_1099_box'] = ''
        const box: Box1099Key = 'nec_1'
        expect(box1099Label(none)).toBe('Not reported')
        expect(box1099Label(box)).toBe('NEC 1 · Nonemployee compensation')
    })
})

describe('box1099Label', () => {
    it('labels no box Not reported and an unknown key with an empty string', () => {
        expect(box1099Label('')).toBe('Not reported')
        expect(box1099Label('misc_7')).toBe('')
    })
})

describe('box1099Options', () => {
    it('starts with Not reported, then each box in order', () => {
        const options = box1099Options()
        expect(options[0]).toEqual({ value: '', label: 'Not reported' })
        expect(options).toHaveLength(11)
        expect(options.slice(1).map(option => option.value)).toEqual([...BOX_1099_KEYS])
        expect(options.slice(1).map(option => option.label)).toEqual(LABELS)
    })
})

describe('EXPENSE_GROUP_TYPES', () => {
    it('is Cost of goods sold, Expense and Other expense, each an account type', () => {
        expect([...EXPENSE_GROUP_TYPES]).toEqual(['cost_of_goods_sold', 'expense', 'other_expense'])
        const keys = ACCOUNT_TYPES.map(type => type.key)
        for (const type of EXPENSE_GROUP_TYPES) {
            expect(keys).toContain(type)
        }
    })

    it('isExpenseGroupType is true for an expense type only', () => {
        expect(isExpenseGroupType('expense')).toBe(true)
        expect(isExpenseGroupType('income')).toBe(false)
        expect(isExpenseGroupType('bank')).toBe(false)
    })
})

describe('form-1099.ts imports', () => {
    // The seed and the fixture load this module in plain node; a runtime import pulls in
    // modules that reach react-native (money.ts → warn-once → the core logger) and the
    // e2e seed fails to parse.
    it('has no runtime import, only import type', () => {
        const source = readFileSync(
            join(__dirname, '..', 'tinycld', 'books', 'lib', 'form-1099.ts'),
            'utf8'
        )
        const lines = source.split('\n')
        const runtimeImports = lines.filter(
            line => /^\s*import\b/.test(line) && !/^\s*import type\s/.test(line)
        )
        const runtimeReExports = lines.filter(
            line => /^\s*export\b.*\bfrom\s/.test(line) && !/^\s*export type\s/.test(line)
        )
        expect(runtimeImports).toEqual([])
        expect(runtimeReExports).toEqual([])
    })
})

describe('form1099Controls', () => {
    const controls = (level: BooksLevel) => form1099Controls(accessFromRow({ level }, true))

    it('gives none and read_only no controls', () => {
        const none = { editsThreshold: false, editsBoxes: false, showsChartButton: false }
        expect(controls('none')).toEqual(none)
        expect(controls('read_only')).toEqual(none)
    })

    it('lets a bookkeeper edit boxes but not the threshold', () => {
        expect(controls('bookkeeper')).toEqual({
            editsThreshold: false,
            editsBoxes: true,
            showsChartButton: true,
        })
    })

    it('lets an admin edit everything', () => {
        expect(controls('admin')).toEqual({
            editsThreshold: true,
            editsBoxes: true,
            showsChartButton: true,
        })
    })
})
