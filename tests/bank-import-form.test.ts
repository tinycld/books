import { describe, expect, it } from 'vitest'
import {
    BANK_IMPORT_ERRORS,
    type BankMapping,
    noColumnText,
} from '../tinycld/books/lib/bank-import'
import {
    type BankImportFormValues,
    bankImportFormSchema,
    bankImportRecord,
    EMPTY_MAPPING_VALUES,
    formFromMapping,
    MAPPING_FIELDS,
    mappingFromForm,
    mappingIssues,
} from '../tinycld/books/lib/bank-import-form'
import {
    BANK_IMPORT_CARD_MAPPING,
    BANK_IMPORT_GUESSED_MAPPING,
} from '../tinycld/books/lib/bank-import-mapping-fixture'

const GUESSED: BankMapping = { ...BANK_IMPORT_GUESSED_MAPPING }
const CARD: BankMapping = { ...BANK_IMPORT_CARD_MAPPING }

function issuesOf(result: {
    success: boolean
    error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
    return (result.error?.issues ?? []).map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

function csvValues(patch: Partial<BankImportFormValues> = {}): BankImportFormValues {
    return { ...formFromMapping(GUESSED), lines: [2], ...patch }
}

describe('form values and the mapping', () => {
    it('starts every mapping field blank', () => {
        expect(MAPPING_FIELDS).toHaveLength(9)
        for (const field of MAPPING_FIELDS) expect(EMPTY_MAPPING_VALUES[field]).toBe('')
    })

    it('writes a mapping as select strings', () => {
        expect(formFromMapping(GUESSED)).toEqual({
            header_row: 'yes',
            date_column: '1',
            date_format: 'MM/DD/YYYY',
            description_column: '2',
            amount_columns: 'two',
            amount_column: '',
            money_in_column: '4',
            money_out_column: '3',
            amount_sign: 'in_positive',
        })
        expect(formFromMapping(CARD).header_row).toBe('no')
    })

    it('reads the strings back to the same mapping', () => {
        expect(mappingFromForm({ ...formFromMapping(GUESSED), lines: [] })).toEqual(GUESSED)
        expect(mappingFromForm({ ...formFromMapping(CARD), lines: [] })).toEqual(CARD)
    })

    it('reads a blank or non-number column as 0', () => {
        const mapping = mappingFromForm({
            ...EMPTY_MAPPING_VALUES,
            date_column: '',
            amount_column: 'abc',
            lines: [],
        })
        expect(mapping.date_column).toBe(0)
        expect(mapping.amount_column).toBe(0)
        expect(mapping.header_row).toBe(false)
    })
})

describe('bankImportFormSchema', () => {
    it('refuses an OFX import with no lines with the parser message, and takes one line', () => {
        const schema = bankImportFormSchema('ofx', 7)
        const empty = schema.safeParse({ ...EMPTY_MAPPING_VALUES, lines: [] })
        expect(empty.success).toBe(false)
        expect(issuesOf(empty)).toEqual([{ path: 'lines', message: BANK_IMPORT_ERRORS.noLines }])
        expect(schema.safeParse({ ...EMPTY_MAPPING_VALUES, lines: [3] }).success).toBe(true)
    })

    it('takes a complete CSV mapping and returns the same strings', () => {
        const values = csvValues()
        const result = bankImportFormSchema('csv', 5).safeParse(values)
        expect(result.success).toBe(true)
        expect(result.data).toEqual(values)
    })

    it('puts each CSV mapping problem on its field with the parser text', () => {
        const schema = bankImportFormSchema('csv', 5)
        expect(issuesOf(schema.safeParse(csvValues({ date_format: '' })))).toEqual([
            { path: 'date_format', message: BANK_IMPORT_ERRORS.chooseFormat },
        ])
        expect(issuesOf(schema.safeParse(csvValues({ money_in_column: '7' })))).toEqual([
            { path: 'money_in_column', message: noColumnText(7) },
        ])
        expect(
            issuesOf(schema.safeParse(csvValues({ amount_columns: 'one', amount_column: '' })))
        ).toEqual([{ path: 'amount_column', message: BANK_IMPORT_ERRORS.chooseAmount }])
    })
})

describe('mappingIssues', () => {
    it('reports the mapping problems but not the lines', () => {
        expect(mappingIssues(csvValues({ lines: [] }), 5)).toEqual([])
        expect(mappingIssues(csvValues({ lines: [], date_format: '' }), 5)).toEqual([
            { path: 'date_format', message: BANK_IMPORT_ERRORS.chooseFormat },
        ])
    })
})

describe('bankImportRecord', () => {
    it('sends the OFX placeholders and the lines for an OFX file', () => {
        expect(
            bankImportRecord({
                id: 'bankimport00001',
                fileId: 'bankfile0000001',
                format: 'ofx',
                values: {
                    ...EMPTY_MAPPING_VALUES,
                    header_row: 'yes',
                    date_column: '4',
                    lines: [1, 3],
                },
            })
        ).toEqual({
            id: 'bankimport00001',
            file: 'bankfile0000001',
            lines: [1, 3],
            header_row: false,
            date_column: 0,
            date_format: '',
            description_column: 0,
            amount_columns: '',
            amount_column: 0,
            money_in_column: 0,
            money_out_column: 0,
            amount_sign: '',
        })
    })

    it('sends the numbers of the mapping for a CSV file', () => {
        expect(
            bankImportRecord({
                id: 'bankimport00002',
                fileId: 'bankfile0000002',
                format: 'csv',
                values: csvValues({ lines: [2, 5] }),
            })
        ).toEqual({
            id: 'bankimport00002',
            file: 'bankfile0000002',
            lines: [2, 5],
            header_row: true,
            date_column: 1,
            date_format: 'MM/DD/YYYY',
            description_column: 2,
            amount_columns: 'two',
            amount_column: 0,
            money_in_column: 4,
            money_out_column: 3,
            amount_sign: 'in_positive',
        })
    })
})
