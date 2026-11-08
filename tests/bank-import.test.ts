import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BANK_DATE_FORMATS,
    BANK_IMPORT_ERRORS,
    BANK_VALUE_ERRORS,
    type BankMapping,
    type BankTxn,
    bankContentRows,
    bankImportSchema,
    MAX_BANK_AMOUNT,
    mapBankRow,
    noColumnText,
    OFX_COLUMNS,
    OFX_MAPPING,
    ofxImportSchema,
    parseBankAmount,
    parseBankDate,
    previewBankRows,
} from '../tinycld/books/lib/bank-import'

const serverFile = (name: string) => readFileSync(join(__dirname, '..', 'server', name), 'utf8')

const goSource = ['bank_values.go', 'bank_import_map.go', 'bank_import.go', 'bank_ofx.go']
    .map(serverFile)
    .join('\n')

function goMessage(name: string): string {
    const match = goSource.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
    if (!match) throw new Error(`no Go constant ${name}`)
    return match[1]
}

function goStringList(name: string): string[] {
    const match = goSource.match(new RegExp(`\\b${name} = \\[\\]string\\{([^}]*)\\}`))
    if (!match) throw new Error(`no Go list ${name}`)
    return [...match[1].matchAll(/"([^"]*)"/g)].map(m => m[1])
}

type Vectors = {
    dates: { text: string; format: string; date?: string; error?: string }[]
    amounts: { text: string; cents?: number; error?: string }[]
    ofxMapping: BankMapping
    rows: {
        name: string
        cells: string[]
        mapping: Partial<BankMapping>
        txn?: BankTxn
        error?: string
    }[]
}

const vectors: Vectors = JSON.parse(serverFile('testdata/bank_import_vectors.json'))

const BLANK_MAPPING: BankMapping = {
    header_row: false,
    date_column: 0,
    date_format: '',
    description_column: 0,
    amount_columns: '',
    amount_column: 0,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: '',
}

describe('the shared vectors (server/testdata/bank_import_vectors.json)', () => {
    it('has every section', () => {
        expect(vectors.dates.length).toBeGreaterThan(0)
        expect(vectors.amounts.length).toBeGreaterThan(0)
        expect(vectors.rows.length).toBeGreaterThan(0)
    })

    it.each(vectors.dates)('parseBankDate("$text", $format)', ({ text, format, date, error }) => {
        const result = parseBankDate(text, format)
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: date })
    })

    it.each(vectors.amounts)('parseBankAmount("$text")', ({ text, cents, error }) => {
        const result = parseBankAmount(text)
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: cents })
    })

    it.each(vectors.rows)('mapBankRow: $name', ({ cells, mapping, txn, error }) => {
        const result = mapBankRow(cells, { ...BLANK_MAPPING, ...mapping })
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: txn })
    })

    it('OFX_MAPPING is the server ofxMapping', () => {
        expect(OFX_MAPPING).toEqual(vectors.ofxMapping)
    })
})

describe('drift with the Go sources', () => {
    it('date formats', () => {
        expect([...BANK_DATE_FORMATS]).toEqual(goStringList('bankDateFormats'))
    })

    it('OFX columns', () => {
        expect([...OFX_COLUMNS]).toEqual(goStringList('ofxColumns'))
    })

    it('value messages', () => {
        expect(BANK_VALUE_ERRORS).toEqual({
            noDate: goMessage('msgBankNoDate'),
            noAmount: goMessage('msgBankNoAmount'),
            zeroAmount: goMessage('msgBankZeroAmount'),
            twoAmounts: goMessage('msgBankTwoAmounts'),
        })
    })

    it('import messages', () => {
        expect(BANK_IMPORT_ERRORS).toEqual({
            chooseDate: goMessage('msgImportChooseDate'),
            chooseFormat: goMessage('msgImportChooseFormat'),
            chooseDescription: goMessage('msgImportChooseDescription'),
            chooseAmountColumns: goMessage('msgImportChooseAmountColumns'),
            chooseAmount: goMessage('msgImportChooseAmount'),
            chooseIn: goMessage('msgImportChooseIn'),
            chooseOut: goMessage('msgImportChooseOut'),
            sameInOut: goMessage('msgImportSameInOut'),
            chooseSign: goMessage('msgImportChooseSign'),
            noLines: goMessage('msgImportNoLines'),
        })
        expect(noColumnText(9)).toBe(goMessage('msgImportNoColumn').replace('%d', '9'))
    })

    it('the amount limit', () => {
        expect(serverFile('posting.go')).toContain('const maxAmount = 1_000_000_000_000_000')
        expect(MAX_BANK_AMOUNT).toBe(1_000_000_000_000_000)
    })
})

describe('bankContentRows', () => {
    it('reads the stored rows', () => {
        expect(bankContentRows([{ line: 1, cells: ['Date', 'Amount'] }])).toEqual([
            { line: 1, cells: ['Date', 'Amount'] },
        ])
    })

    it('refuses anything else', () => {
        expect(bankContentRows(null)).toBeNull()
        expect(bankContentRows([{ line: '1', cells: [] }])).toBeNull()
        expect(bankContentRows([{ line: 1, cells: [1] }])).toBeNull()
    })
})

describe('previewBankRows', () => {
    const rows = [
        { line: 1, cells: ['Date', 'Description', 'Amount'] },
        { line: 2, cells: ['2026-09-02', 'Deposit', '4250.00'] },
        { line: 4, cells: ['2026-02-30', 'Bad', '1.00'] },
    ]
    const mapping: BankMapping = {
        ...BLANK_MAPPING,
        header_row: true,
        date_column: 1,
        date_format: 'YYYY-MM-DD',
        description_column: 2,
        amount_columns: 'one',
        amount_column: 3,
        amount_sign: 'in_positive',
    }

    it('skips the header and maps every other row', () => {
        const preview = previewBankRows(rows, mapping)
        expect(preview.headerLine).toBe(1)
        expect(preview.rows.map(row => row.line)).toEqual([2, 4])
        expect(preview.rows[0].result).toEqual({
            ok: true,
            value: {
                date: '2026-09-02',
                description: 'Deposit',
                memo: '',
                amount: 425000,
                fitid: '',
                checkNumber: '',
            },
        })
        expect(preview.rows[1].result).toEqual({
            ok: false,
            message: '"2026-02-30" is not a date in the YYYY-MM-DD format.',
        })
    })

    it('has no header line without a header row or rows', () => {
        expect(previewBankRows(rows, { ...mapping, header_row: false }).headerLine).toBeNull()
        expect(previewBankRows([], mapping)).toEqual({ headerLine: null, rows: [] })
    })
})

describe('bankImportSchema', () => {
    const complete = {
        header_row: true,
        date_column: 1,
        date_format: 'YYYY-MM-DD',
        description_column: 2,
        amount_columns: 'one',
        amount_column: 3,
        money_in_column: 0,
        money_out_column: 0,
        amount_sign: 'in_positive',
        lines: [2],
    }

    function issues(values: Record<string, unknown>) {
        const result = bankImportSchema(3).safeParse(values)
        return result.success
            ? []
            : result.error.issues.map(issue => [issue.path.join('.'), issue.message])
    }

    it('accepts a complete mapping', () => {
        expect(issues(complete)).toEqual([])
        expect(
            issues({
                ...complete,
                amount_columns: 'two',
                amount_column: 0,
                money_in_column: 3,
                money_out_column: 2,
            })
        ).toEqual([])
    })

    it.each([
        ['date_column', { date_column: 0 }, BANK_IMPORT_ERRORS.chooseDate],
        ['date_column', { date_column: 9 }, 'Column 9 is not in this file.'],
        ['date_format', { date_format: '' }, BANK_IMPORT_ERRORS.chooseFormat],
        ['description_column', { description_column: 0 }, BANK_IMPORT_ERRORS.chooseDescription],
        ['amount_columns', { amount_columns: '' }, BANK_IMPORT_ERRORS.chooseAmountColumns],
        ['amount_column', { amount_column: 0 }, BANK_IMPORT_ERRORS.chooseAmount],
        ['amount_sign', { amount_sign: '' }, BANK_IMPORT_ERRORS.chooseSign],
        [
            'money_in_column',
            { amount_columns: 'two', money_out_column: 3 },
            BANK_IMPORT_ERRORS.chooseIn,
        ],
        [
            'money_out_column',
            { amount_columns: 'two', money_in_column: 3 },
            BANK_IMPORT_ERRORS.chooseOut,
        ],
        [
            'money_out_column',
            { amount_columns: 'two', money_in_column: 3, money_out_column: 3 },
            BANK_IMPORT_ERRORS.sameInOut,
        ],
        ['lines', { lines: [] }, BANK_IMPORT_ERRORS.noLines],
    ])('%s: %o', (path, change, message) => {
        expect(issues({ ...complete, ...change })).toContainEqual([path, message])
    })

    it('ofxImportSchema needs only lines', () => {
        expect(ofxImportSchema.safeParse({ lines: [9] }).success).toBe(true)
        const result = ofxImportSchema.safeParse({ lines: [] })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues[0].message).toBe(BANK_IMPORT_ERRORS.noLines)
    })
})
