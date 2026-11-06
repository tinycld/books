// The import form of the bank import page: its values, its resolver schema and the row it
// inserts. The select fields hold strings because core SelectInput compares string
// values; the schema reads them as the parser's mapping and runs the parser's own schema,
// so the messages and their fields are the server's. tests/bank-import-form.test.ts.
import { z } from '@tinycld/core/ui/form'
import type { BooksBankFiles, BooksBankImports } from '../types'
import {
    BANK_DATE_FORMATS,
    type BankMapping,
    bankImportSchema,
    ofxImportSchema,
} from './bank-import'

export type BankImportFormValues = {
    header_row: '' | 'yes' | 'no'
    date_column: string
    date_format: string
    description_column: string
    amount_columns: string
    amount_column: string
    money_in_column: string
    money_out_column: string
    amount_sign: string
    lines: number[]
}

export const MAPPING_FIELDS = [
    'header_row',
    'date_column',
    'date_format',
    'description_column',
    'amount_columns',
    'amount_column',
    'money_in_column',
    'money_out_column',
    'amount_sign',
] as const

export const EMPTY_MAPPING_VALUES: Omit<BankImportFormValues, 'lines'> = {
    header_row: '',
    date_column: '',
    date_format: '',
    description_column: '',
    amount_columns: '',
    amount_column: '',
    money_in_column: '',
    money_out_column: '',
    amount_sign: '',
}

function columnNumber(text: string): number {
    if (text.trim() === '') return 0
    const value = Number(text)
    return Number.isInteger(value) ? value : 0
}

function columnText(value: number): string {
    return value > 0 ? String(value) : ''
}

export function mappingFromForm(values: BankImportFormValues): BankMapping {
    return {
        header_row: values.header_row === 'yes',
        date_column: columnNumber(values.date_column),
        date_format: values.date_format,
        description_column: columnNumber(values.description_column),
        amount_columns: values.amount_columns,
        amount_column: columnNumber(values.amount_column),
        money_in_column: columnNumber(values.money_in_column),
        money_out_column: columnNumber(values.money_out_column),
        amount_sign: values.amount_sign,
    }
}

export function formFromMapping(mapping: BankMapping): Omit<BankImportFormValues, 'lines'> {
    return {
        header_row: mapping.header_row ? 'yes' : 'no',
        date_column: columnText(mapping.date_column),
        date_format: mapping.date_format,
        description_column: columnText(mapping.description_column),
        amount_columns: mapping.amount_columns,
        amount_column: columnText(mapping.amount_column),
        money_in_column: columnText(mapping.money_in_column),
        money_out_column: columnText(mapping.money_out_column),
        amount_sign: mapping.amount_sign,
    }
}

const formShape = z.object({
    header_row: z.enum(['', 'yes', 'no']),
    date_column: z.string(),
    date_format: z.string(),
    description_column: z.string(),
    amount_columns: z.string(),
    amount_column: z.string(),
    money_in_column: z.string(),
    money_out_column: z.string(),
    amount_sign: z.string(),
    lines: z.array(z.number()),
})

type Issue = { path: PropertyKey[]; message: string }

function parserIssues(
    format: BooksBankFiles['format'],
    columns: number,
    values: BankImportFormValues
): Issue[] {
    const result =
        format === 'ofx'
            ? ofxImportSchema.safeParse({ lines: values.lines })
            : bankImportSchema(columns).safeParse({
                  ...mappingFromForm(values),
                  lines: values.lines,
              })
    return result.success ? [] : result.error.issues
}

// No transform, so handleSubmit gets the form's own strings back.
export function bankImportFormSchema(
    format: BooksBankFiles['format'],
    columns: number
): z.ZodType<BankImportFormValues, BankImportFormValues> {
    return formShape.superRefine((values, ctx) => {
        for (const issue of parserIssues(format, columns, values)) {
            ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
        }
    })
}

// The CSV mapping's problems, without the lines (the Choose step checks those).
export function mappingIssues(
    values: BankImportFormValues,
    columns: number
): { path: string; message: string }[] {
    return parserIssues('csv', columns, values)
        .filter(issue => issue.path[0] !== 'lines')
        .map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message }))
}

export type BankImportInsert = Omit<
    BooksBankImports,
    'created' | 'updated' | 'imported' | 'duplicates' | 'created_by'
>

// The server applies OFX_MAPPING to an OFX file; the row carries the empty mapping.
export const OFX_IMPORT_FIELDS = {
    header_row: false,
    date_column: 0,
    date_format: '',
    description_column: 0,
    amount_columns: '',
    amount_column: 0,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: '',
} as const satisfies Partial<BankImportInsert>

const DATE_FORMAT_VALUES = ['', ...BANK_DATE_FORMATS] as const
const AMOUNT_COLUMNS_VALUES = ['', 'one', 'two'] as const
const AMOUNT_SIGN_VALUES = ['', 'in_positive', 'out_positive'] as const

// The schema has already checked these; an unknown value is sent as '' so the server
// refuses it with its own message rather than the row type lying about it.
function oneOf<T extends string>(values: readonly T[], value: string): T | '' {
    return values.find(item => item === value) ?? ''
}

export function bankImportRecord(input: {
    id: string
    fileId: string
    format: BooksBankFiles['format']
    values: BankImportFormValues
}): BankImportInsert {
    const { id, fileId, format, values } = input
    const base = { id, file: fileId, lines: values.lines }
    if (format === 'ofx') return { ...base, ...OFX_IMPORT_FIELDS }
    const mapping = mappingFromForm(values)
    return {
        ...base,
        header_row: mapping.header_row,
        date_column: mapping.date_column,
        date_format: oneOf(DATE_FORMAT_VALUES, mapping.date_format),
        description_column: mapping.description_column,
        amount_columns: oneOf(AMOUNT_COLUMNS_VALUES, mapping.amount_columns),
        amount_column: mapping.amount_column,
        money_in_column: mapping.money_in_column,
        money_out_column: mapping.money_out_column,
        amount_sign: oneOf(AMOUNT_SIGN_VALUES, mapping.amount_sign),
    }
}
