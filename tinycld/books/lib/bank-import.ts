// The client twin of the server's bank import rules (server/bank_values.go,
// server/bank_import_map.go, server/bank_import.go). The mapping screen previews
// each row with them, so a person sees every row error before importing; the
// server repeats every check. tests/bank-import.test.ts runs the server's vectors
// (server/testdata/bank_import_vectors.json) and drift-tests the texts.
import { z } from '@tinycld/core/ui/form'

export const BANK_DATE_FORMATS = [
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DD',
    'MM/DD/YY',
    'DD/MM/YY',
] as const

export type BankDateFormat = (typeof BANK_DATE_FORMATS)[number]

// The cells of an OFX file's row, in order; OFX_MAPPING reads them.
export const OFX_COLUMNS = [
    'Date',
    'Description',
    'Memo',
    'Amount',
    'Transaction ID',
    'Check number',
    'Type',
] as const

// Minor units, the ledger's per-line limit (server/posting.go maxAmount).
export const MAX_BANK_AMOUNT = 1_000_000_000_000_000

export const BANK_VALUE_ERRORS = {
    noDate: 'There is no date.',
    noAmount: 'There is no amount.',
    zeroAmount: 'The amount is 0.',
    twoAmounts: 'Both money in and money out have an amount.',
} as const

export const BANK_IMPORT_ERRORS = {
    chooseDate: 'Choose the column that holds the date.',
    chooseFormat: 'Choose the date format of your file.',
    chooseDescription: 'Choose the column that holds the description.',
    chooseAmountColumns: 'Choose how many columns show amounts.',
    chooseAmount: 'Choose the column that holds the amount.',
    chooseIn: 'Choose the column that holds money in.',
    chooseOut: 'Choose the column that holds money out.',
    sameInOut: 'Money in and money out must be different columns.',
    chooseSign: 'Choose whether a positive amount is money in or money out.',
    noLines: 'Choose at least one transaction to import.',
} as const

export function noColumnText(column: number): string {
    return `Column ${column} is not in this file.`
}

export type BankValue<T> = { ok: true; value: T } | { ok: false; message: string }

const QUOTED_CHARS = 40
const AMOUNT_SPACES = /[ \t\u00a0\u202f]/g
const CURRENCY_SIGNS = /[$€£¥]/g
const DESCRIPTION_CHARS = 500
const FITID_CHARS = 255
const CHECK_CHARS = 32

function cut(text: string, max: number): string {
    const chars = [...text]
    return chars.length > max ? chars.slice(0, max).join('') : text
}

function quoted(text: string): string {
    const chars = [...text]
    return `"${chars.length > QUOTED_CHARS ? `${chars.slice(0, QUOTED_CHARS).join('')}…` : text}"`
}

function fail<T>(message: string): BankValue<T> {
    return { ok: false, message }
}

const DIGITS = /^[0-9]+$/

function dateParts(format: string, parts: string[]): { y: string; m: string; d: string } | null {
    const [a, b, c] = parts
    switch (format) {
        case 'MM/DD/YYYY':
        case 'MM/DD/YY':
            return { m: a, d: b, y: c }
        case 'DD/MM/YYYY':
        case 'DD/MM/YY':
            return { d: a, m: b, y: c }
        case 'YYYY-MM-DD':
            return { y: a, m: b, d: c }
        default:
            return null
    }
}

function isDayPart(part: string): boolean {
    return part.length >= 1 && part.length <= 2 && DIGITS.test(part)
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Only the first word counts, so a time after the date is ignored; for
// YYYY-MM-DD an ISO time after a "T" is too. A two-digit year is 20YY.
export function parseBankDate(text: string, format: string): BankValue<string> {
    const trimmed = text.trim()
    if (trimmed === '') return fail(BANK_VALUE_ERRORS.noDate)
    const bad = fail<string>(`${quoted(trimmed)} is not a date in the ${format} format.`)
    let token = trimmed.split(/\s+/)[0]
    if (format === 'YYYY-MM-DD') token = token.split('T')[0]
    const parts = token.split(/[/.-]/)
    if (parts.length !== 3) return bad
    const named = dateParts(format, parts)
    if (!named) return bad
    const yearDigits = format.endsWith('/YY') ? 2 : 4
    if (
        named.y.length !== yearDigits ||
        !DIGITS.test(named.y) ||
        !isDayPart(named.m) ||
        !isDayPart(named.d)
    ) {
        return bad
    }
    const year = Number(named.y) + (yearDigits === 2 ? 2000 : 0)
    const month = Number(named.m)
    const day = Number(named.d)
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
        return bad
    const pad = (n: number) => String(n).padStart(2, '0')
    return { ok: true, value: `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}` }
}

function count(text: string, mark: string): number {
    return text.split(mark).length - 1
}

// Splits digits with "." and "," into the whole part (group marks removed) and
// the fraction: the later mark is the decimal mark when both appear; a lone ","
// is one only with one or two digits after it; a lone "." always is.
function splitBankNumber(text: string): { whole: string; frac: string } | null {
    const dot = text.lastIndexOf('.')
    const comma = text.lastIndexOf(',')
    let decimal = ''
    let group = ''
    if (dot >= 0 && comma >= 0) {
        decimal = dot > comma ? '.' : ','
        group = dot > comma ? ',' : '.'
    } else if (comma >= 0) {
        const after = text.length - comma - 1
        if (count(text, ',') === 1 && after >= 1 && after <= 2) decimal = ','
        else group = ','
    } else if (dot >= 0) {
        if (count(text, '.') === 1) decimal = '.'
        else group = '.'
    }
    let whole = text
    let frac = ''
    if (decimal) {
        const at = text.lastIndexOf(decimal)
        whole = text.slice(0, at)
        frac = text.slice(at + 1)
    }
    if (/[.,]/.test(frac)) return null
    if (group) {
        const groups = whole.split(group)
        if (groups[0].length < 1 || groups[0].length > 3) return null
        if (groups.slice(1).some(g => g.length !== 3)) return null
        whole = groups.join('')
    }
    if (/[.,]/.test(whole) || (whole === '' && frac === '')) return null
    return { whole: whole === '' ? '0' : whole, frac }
}

// An amount as banks write it, in signed minor units.
export function parseBankAmount(text: string): BankValue<number> {
    const trimmed = text.trim()
    if (trimmed === '') return fail(BANK_VALUE_ERRORS.noAmount)
    const bad = fail<number>(`${quoted(trimmed)} is not an amount.`)
    let s = trimmed
    let negative = false
    if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
        negative = true
        s = s.slice(1, -1)
    }
    s = s.replace(AMOUNT_SPACES, '').replace(CURRENCY_SIGNS, '')
    if (s.startsWith('-')) {
        negative = true
        s = s.slice(1)
    } else if (s.startsWith('+')) {
        s = s.slice(1)
    } else if (s.endsWith('-')) {
        negative = true
        s = s.slice(0, -1)
    }
    if (s === '' || /[^0-9.,]/.test(s)) return bad
    const parts = splitBankNumber(s)
    if (!parts) return bad
    if (parts.frac.length > 2) return fail(`${quoted(trimmed)} has more than 2 decimals.`)
    const digits = (parts.whole + `${parts.frac}00`.slice(0, 2)).replace(/^0+/, '')
    if (digits === '') return { ok: true, value: 0 }
    const tooLarge = fail<number>(`${quoted(trimmed)} is too large for Books.`)
    if (digits.length > 16) return tooLarge
    const cents = Number(digits)
    if (cents > MAX_BANK_AMOUNT) return tooLarge
    return { ok: true, value: negative ? -cents : cents }
}

// Columns are 1-based; 0 is "not chosen". The first nine fields are the
// books_bank_imports fields the mapping form sends.
export type BankMapping = {
    header_row: boolean
    date_column: number
    date_format: string
    description_column: number
    amount_columns: string
    amount_column: number
    money_in_column: number
    money_out_column: number
    amount_sign: string
    memo_column?: number
    fitid_column?: number
    check_column?: number
}

export const OFX_MAPPING: BankMapping = {
    header_row: false,
    date_column: 1,
    date_format: 'YYYY-MM-DD',
    description_column: 2,
    memo_column: 3,
    amount_columns: 'one',
    amount_column: 4,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: 'in_positive',
    fitid_column: 5,
    check_column: 6,
}

export type BankTxn = {
    date: string
    description: string
    memo: string
    amount: number
    fitid: string
    checkNumber: string
}

function cell(cells: readonly string[], column: number | undefined): string {
    if (!column || column < 1 || column > cells.length) return ''
    return cells[column - 1].trim()
}

function rowAmount(cells: readonly string[], mapping: BankMapping): BankValue<number> {
    let amount: number
    if (mapping.amount_columns === 'two') {
        const moneyIn = cell(cells, mapping.money_in_column)
        const moneyOut = cell(cells, mapping.money_out_column)
        if (moneyIn === '' && moneyOut === '') return fail(BANK_VALUE_ERRORS.noAmount)
        let inCents = 0
        let outCents = 0
        if (moneyIn !== '') {
            const parsed = parseBankAmount(moneyIn)
            if (!parsed.ok) return parsed
            inCents = Math.abs(parsed.value)
        }
        if (moneyOut !== '') {
            const parsed = parseBankAmount(moneyOut)
            if (!parsed.ok) return parsed
            outCents = Math.abs(parsed.value)
        }
        if (inCents !== 0 && outCents !== 0) return fail(BANK_VALUE_ERRORS.twoAmounts)
        amount = inCents - outCents
    } else {
        const parsed = parseBankAmount(cell(cells, mapping.amount_column))
        if (!parsed.ok) return parsed
        amount = mapping.amount_sign === 'out_positive' ? -parsed.value : parsed.value
    }
    if (amount === 0) return fail(BANK_VALUE_ERRORS.zeroAmount)
    return { ok: true, value: amount }
}

// One row read as a bank transaction: the date first, then the amount.
export function mapBankRow(cells: readonly string[], mapping: BankMapping): BankValue<BankTxn> {
    const date = parseBankDate(cell(cells, mapping.date_column), mapping.date_format)
    if (!date.ok) return date
    const amount = rowAmount(cells, mapping)
    if (!amount.ok) return amount
    return {
        ok: true,
        value: {
            date: date.value,
            description: cut(cell(cells, mapping.description_column), DESCRIPTION_CHARS),
            memo: cut(cell(cells, mapping.memo_column), DESCRIPTION_CHARS),
            amount: amount.value,
            fitid: cut(cell(cells, mapping.fitid_column), FITID_CHARS),
            checkNumber: cut(cell(cells, mapping.check_column), CHECK_CHARS),
        },
    }
}

export type BankRow = { line: number; cells: string[] }

const bankRowsSchema = z.array(
    z.object({ line: z.number().int().positive(), cells: z.array(z.string()) })
)

// books_bank_file_contents.rows as rows, or null when it is not what the server writes.
export function bankContentRows(value: unknown): BankRow[] | null {
    const parsed = bankRowsSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export type BankPreviewRow = { line: number; result: BankValue<BankTxn> }

// Every row but the header, mapped as the server will map it.
export function previewBankRows(
    rows: readonly BankRow[],
    mapping: BankMapping
): { headerLine: number | null; rows: BankPreviewRow[] } {
    const headerLine = mapping.header_row && rows.length > 0 ? rows[0].line : null
    const body = headerLine === null ? rows : rows.slice(1)
    return {
        headerLine,
        rows: body.map(row => ({ line: row.line, result: mapBankRow(row.cells, mapping) })),
    }
}

const linesSchema = z.array(z.number().int().positive()).min(1, BANK_IMPORT_ERRORS.noLines)

// The CSV mapping form, with the server's messages on the server's fields.
export function bankImportSchema(columns: number) {
    return z
        .object({
            header_row: z.boolean(),
            date_column: z.number().int(),
            date_format: z.string(),
            description_column: z.number().int(),
            amount_columns: z.string(),
            amount_column: z.number().int(),
            money_in_column: z.number().int(),
            money_out_column: z.number().int(),
            amount_sign: z.string(),
            lines: linesSchema,
        })
        .superRefine((values, ctx) => {
            const column = (path: string, value: number, choose: string) => {
                if (value < 1) ctx.addIssue({ code: 'custom', path: [path], message: choose })
                else if (value > columns)
                    ctx.addIssue({ code: 'custom', path: [path], message: noColumnText(value) })
            }
            column('date_column', values.date_column, BANK_IMPORT_ERRORS.chooseDate)
            if (!(BANK_DATE_FORMATS as readonly string[]).includes(values.date_format)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['date_format'],
                    message: BANK_IMPORT_ERRORS.chooseFormat,
                })
            }
            column(
                'description_column',
                values.description_column,
                BANK_IMPORT_ERRORS.chooseDescription
            )
            if (values.amount_columns === 'one') {
                column('amount_column', values.amount_column, BANK_IMPORT_ERRORS.chooseAmount)
                if (values.amount_sign !== 'in_positive' && values.amount_sign !== 'out_positive') {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['amount_sign'],
                        message: BANK_IMPORT_ERRORS.chooseSign,
                    })
                }
            } else if (values.amount_columns === 'two') {
                column('money_in_column', values.money_in_column, BANK_IMPORT_ERRORS.chooseIn)
                column('money_out_column', values.money_out_column, BANK_IMPORT_ERRORS.chooseOut)
                if (
                    values.money_in_column > 0 &&
                    values.money_in_column === values.money_out_column
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['money_out_column'],
                        message: BANK_IMPORT_ERRORS.sameInOut,
                    })
                }
            } else {
                ctx.addIssue({
                    code: 'custom',
                    path: ['amount_columns'],
                    message: BANK_IMPORT_ERRORS.chooseAmountColumns,
                })
            }
        })
}

// An OFX file's columns are fixed; its import form chooses only the lines.
export const ofxImportSchema = z.object({ lines: linesSchema })
