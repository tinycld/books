import { describe, expect, it } from 'vitest'
import { type BankMapping, OFX_MAPPING, previewBankRows } from '../tinycld/books/lib/bank-import'
import { type BankImportFormValues, formFromMapping } from '../tinycld/books/lib/bank-import-form'
import {
    BANK_IMPORT_CHECKING_ROWS,
    BANK_IMPORT_GUESSED_MAPPING,
    BANK_IMPORT_LONG_PAYEE,
    BANK_IMPORT_OFX_ROWS,
} from '../tinycld/books/lib/bank-import-mapping-fixture'
import {
    alreadyImportedLines,
    bankImportPageState,
    bankImportStepLabels,
    type ChoiceRow,
    choiceRows,
    chooseStepNumber,
    columnOptions,
    dateFormatOptions,
    errorBandText,
    importButtonText,
    importResultText,
    importSummary,
    keepChoice,
    mapIntroText,
    nothingToChoose,
    readyLines,
    samplePreview,
    selectAllState,
    selectionText,
    selectionTotals,
    statementBalance,
    toggleAllLines,
    toggleLine,
} from '../tinycld/books/lib/bank-import-view'

const MAPPING: BankMapping = { ...BANK_IMPORT_GUESSED_MAPPING }
const PREVIEW = previewBankRows(BANK_IMPORT_CHECKING_ROWS, MAPPING).rows
const ALREADY = new Set([2, 3, 4, 5, 6, 7])

function lineRange(first: number, last: number): number[] {
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

// Lines 8–41 but the three error lines: the ready lines of the checking CSV.
const READY = lineRange(8, 41).filter(line => ![14, 19, 27].includes(line))

function checkingRows(chosen: ReadonlySet<number>) {
    return choiceRows({
        rows: BANK_IMPORT_CHECKING_ROWS,
        preview: PREVIEW,
        mapping: MAPPING,
        already: ALREADY,
        chosen,
        currency: 'USD',
    })
}

function rowAt(rows: ChoiceRow[], line: number): ChoiceRow {
    const row = rows.find(r => r.line === line)
    if (!row) throw new Error(`no row for line ${line}`)
    return row
}

function choice(seed: Partial<ChoiceRow> & Pick<ChoiceRow, 'line'>): ChoiceRow {
    return {
        kind: 'ready',
        isChosen: false,
        day: '2026-10-01',
        dateText: 'Oct 1, 2026',
        description: `Row ${seed.line}`,
        memo: '',
        amount: 100,
        amountText: '$1.00',
        message: '',
        ...seed,
    }
}

describe('choiceRows', () => {
    it('reads each checking row as ready, error or already imported, in file order', () => {
        const rows = checkingRows(new Set(READY.filter(line => line !== 24)))
        expect(rows).toHaveLength(40)
        expect(rows.map(r => r.line)).toEqual(lineRange(2, 41))

        const line14 = rowAt(rows, 14)
        expect(line14.kind).toBe('error')
        expect(line14.isChosen).toBe(false)
        expect(line14.message).toBe('Line 14: "13/45/2026" is not a date in the MM/DD/YYYY format.')
        expect(line14.dateText).toBe('13/45/2026')
        expect(line14.amountText).toBe('42.00')
        expect(line14.day).toBe('')
        expect(line14.amount).toBe(0)

        const line19 = rowAt(rows, 19)
        expect(line19.kind).toBe('error')
        expect(line19.isChosen).toBe(false)
        expect(line19.message).toBe('Line 19: Both money in and money out have an amount.')
        expect(line19.amountText).toBe('25.00 / 25.00')

        const line27 = rowAt(rows, 27)
        expect(line27.kind).toBe('error')
        expect(line27.isChosen).toBe(false)

        for (const line of ALREADY) {
            const row = rowAt(rows, line)
            expect(row.kind).toBe('already')
            expect(row.amountText).toBe('Already imported')
            expect(row.isChosen).toBe(false)
        }

        const line24 = rowAt(rows, 24)
        expect(line24.kind).toBe('ready')
        expect(line24.isChosen).toBe(false)

        const line8 = rowAt(rows, 8)
        expect(line8.kind).toBe('ready')
        expect(line8.isChosen).toBe(true)
        expect(line8.day).toBe('2026-10-05')
        expect(line8.dateText).toBe('Oct 5, 2026')
        expect(line8.amount).toBe(-1840)
        expect(line8.amountText).toBe('-$18.40')
        expect(line8.description).toBe(
            'SQ *BLUE BOTTLE COFFEE OAKLAND CA 10/06 PURCHASE DEBIT CARD 4821 REF 8'
        )
        expect(line8.message).toBe('')
    })

    it('never chooses an error or already-imported line, even when asked to', () => {
        const rows = checkingRows(new Set([2, 14, 19, 27, 8]))
        expect(rows.filter(r => r.isChosen).map(r => r.line)).toEqual([8])
    })

    it('keeps an OFX row memo', () => {
        const preview = previewBankRows(BANK_IMPORT_OFX_ROWS, OFX_MAPPING).rows
        const rows = choiceRows({
            rows: BANK_IMPORT_OFX_ROWS,
            preview,
            mapping: OFX_MAPPING,
            already: new Set(),
            chosen: new Set([1]),
            currency: 'USD',
        })
        const first = rowAt(rows, 1)
        expect(first.kind).toBe('ready')
        expect(first.isChosen).toBe(true)
        expect(first.description).toBe('HARBOR DESIGN LLC')
        expect(first.memo).toBe('ACH CREDIT INV 1043')
        expect(first.amountText).toBe('$3,100.00')
        expect(first.dateText).toBe('Oct 1, 2026')
    })
})

describe('readyLines and alreadyImportedLines', () => {
    it('lists the 31 ready lines of the checking CSV in file order', () => {
        const lines = readyLines(PREVIEW, ALREADY)
        expect(lines).toHaveLength(31)
        expect(lines).toEqual(READY)
    })

    it('unions earlier imports, skips bad entries and leaves out the one in flight', () => {
        const earlier = [
            { id: 'imp1', lines: [2, 3] },
            { id: 'imp2', lines: [3, 9] },
            { id: 'imp3', lines: 'not a list' },
            { id: 'imp4', lines: [10, '11', 4.5] },
            { id: 'imp5', lines: [20, 21] },
        ]
        expect([...alreadyImportedLines(earlier, 'imp5')].sort((a, b) => a - b)).toEqual([
            2, 3, 9, 10,
        ])
        expect([...alreadyImportedLines(earlier, null)].sort((a, b) => a - b)).toEqual([
            2, 3, 9, 10, 20, 21,
        ])
    })
})

describe('importSummary', () => {
    it('counts the rows and names the first and last readable days', () => {
        const summary = importSummary(checkingRows(new Set(READY)))
        expect(summary.text).toBe('40 transactions from Oct 1 to Oct 31, 2026')
        expect(summary.tail).toBe(' · 3 with errors · 6 already imported')
    })

    it('writes one row in the singular, with no tail', () => {
        const summary = importSummary([
            choice({ line: 1, day: '2026-10-02', dateText: 'Oct 2, 2026' }),
        ])
        expect(summary.text).toBe('1 transaction from Oct 2 to Oct 2, 2026')
        expect(summary.tail).toBe('')
    })

    it('writes both years when the days fall in two years', () => {
        const summary = importSummary([
            choice({ line: 1, day: '2025-12-28', dateText: 'Dec 28, 2025' }),
            choice({ line: 2, day: '2026-01-03', dateText: 'Jan 3, 2026' }),
        ])
        expect(summary.text).toBe('2 transactions from Dec 28, 2025 to Jan 3, 2026')
    })

    it('names no days when no row has a readable day', () => {
        const error = (line: number) =>
            choice({
                line,
                kind: 'error',
                day: '',
                dateText: 'Pending',
                amount: 0,
                amountText: '1.00',
                message: `Line ${line}: "Pending" is not a date in the MM/DD/YYYY format.`,
            })
        const two = importSummary([error(1), error(2)])
        expect(two.text).toBe('2 transactions')
        expect(two.tail).toBe(' · 2 with errors')
        expect(importSummary([error(1)]).tail).toBe(' · 1 with errors')
    })
})

describe('selectionTotals and selectionText', () => {
    it('sums the chosen rows only, in integer cents', () => {
        const rows = [
            choice({ line: 1, isChosen: true, amount: 425_000 }),
            choice({ line: 2, isChosen: true, amount: -8_647 }),
            choice({ line: 3, isChosen: true, amount: -171_200 }),
            choice({ line: 4, isChosen: false, amount: 99_999 }),
            choice({ line: 5, isChosen: false, amount: -5_000 }),
            choice({
                line: 6,
                kind: 'error',
                day: '',
                amount: 0,
                amountText: '42.00',
                message: 'Line 6: There is no date.',
            }),
        ]
        const totals = selectionTotals(rows)
        expect(totals).toEqual({ count: 3, moneyIn: 425_000, moneyOut: 179_847 })
        expect(selectionText(totals, 'USD')).toBe(
            '3 selected · Money in $4,250.00 · Money out $1,798.47'
        )
    })
})

describe('select all and toggles', () => {
    const rows = (chosen: number[]) => [
        choice({ line: 2, isChosen: chosen.includes(2) }),
        choice({ line: 3, isChosen: chosen.includes(3) }),
        choice({
            line: 4,
            kind: 'error',
            day: '',
            amount: 0,
            message: 'Line 4: There is no date.',
        }),
        choice({ line: 5, kind: 'already', amountText: 'Already imported' }),
        choice({ line: 6, isChosen: chosen.includes(6) }),
    ]

    it('is checked, empty or mixed by the ready rows chosen', () => {
        expect(selectAllState(rows([2, 3, 6]))).toBe('checked')
        expect(selectAllState(rows([]))).toBe('empty')
        expect(selectAllState(rows([3]))).toBe('mixed')
        expect(
            selectAllState([
                choice({ line: 1, kind: 'already', amountText: 'Already imported' }),
                choice({ line: 2, kind: 'error', day: '', amount: 0, message: 'x' }),
            ])
        ).toBe('empty')
    })

    it('chooses every ready line, or none when all are chosen', () => {
        expect(toggleAllLines(rows([3]))).toEqual([2, 3, 6])
        expect(toggleAllLines(rows([]))).toEqual([2, 3, 6])
        expect(toggleAllLines(rows([2, 3, 6]))).toEqual([])
    })

    it('flips one line and keeps file order', () => {
        expect(toggleLine(rows([6]), new Set([6]), 2)).toEqual([2, 6])
        expect(toggleLine(rows([6, 2]), new Set([6, 2]), 3)).toEqual([2, 3, 6])
        expect(toggleLine(rows([2, 3, 6]), new Set([6, 3, 2]), 3)).toEqual([2, 6])
    })
})

describe('texts', () => {
    it('labels the import button by the count', () => {
        expect(importButtonText(0)).toBe('Import')
        expect(importButtonText(1)).toBe('Import 1 transaction')
        expect(importButtonText(36)).toBe('Import 36 transactions')
    })

    it('writes the import result', () => {
        const accountLabel = '1000 Business Checking'
        expect(importResultText({ imported: 36, duplicates: 0, accountLabel })).toEqual({
            headline: 'Imported 36 transactions into 1000 Business Checking.',
            detail: '',
        })
        expect(importResultText({ imported: 36, duplicates: 4, accountLabel })).toEqual({
            headline: 'Imported 36 transactions into 1000 Business Checking.',
            detail: '4 chosen transactions were already in Books, so they were skipped.',
        })
        expect(importResultText({ imported: 1, duplicates: 1, accountLabel })).toEqual({
            headline: 'Imported 1 transaction into 1000 Business Checking.',
            detail: '1 chosen transaction was already in Books, so it was skipped.',
        })
        expect(importResultText({ imported: 0, duplicates: 4, accountLabel })).toEqual({
            headline: 'Nothing new was imported: all 4 chosen transactions were already in Books.',
            detail: '',
        })
        expect(importResultText({ imported: 0, duplicates: 1, accountLabel })).toEqual({
            headline: 'Nothing new was imported: the 1 chosen transaction was already in Books.',
            detail: '',
        })
    })

    it('writes the error band for each format', () => {
        expect(errorBandText(2, 'csv')).toBe(
            '2 rows have errors and cannot be imported. Change the mapping to read them, or import the other rows.'
        )
        expect(errorBandText(1, 'csv')).toBe(
            '1 row has an error and cannot be imported. Change the mapping to read it, or import the other rows.'
        )
        expect(errorBandText(2, 'ofx')).toBe('Books could not read 2 rows of this OFX file.')
        expect(errorBandText(1, 'ofx')).toBe('Books could not read 1 row of this OFX file.')
    })

    it('names the steps of each format and the Choose step number', () => {
        expect(bankImportStepLabels('csv')).toEqual([
            'Upload',
            'Map columns',
            'Choose transactions',
        ])
        expect(bankImportStepLabels('ofx')).toEqual(['Upload', 'Choose transactions'])
        expect(chooseStepNumber('csv')).toBe(3)
        expect(chooseStepNumber('ofx')).toBe(2)
    })

    it('finds nothing to choose in an empty or fully imported file', () => {
        const already = (line: number) =>
            choice({ line, kind: 'already', amountText: 'Already imported' })
        expect(nothingToChoose([])).toBe('empty')
        expect(nothingToChoose([already(1), already(2)])).toBe('allImported')
        expect(nothingToChoose([already(1), choice({ line: 2 }), already(3)])).toBeNull()
        // An unreadable row cannot be chosen either, so a file whose other rows are all
        // imported has nothing left (the OFX e2e imports every readable row of a file with
        // one PENDING row and then expects bank-import-all-imported).
        expect(
            nothingToChoose([
                already(1),
                choice({ line: 2, kind: 'error', day: '', amount: 0, message: 'x' }),
            ])
        ).toBe('allImported')
    })
})

describe('bankImportPageState', () => {
    const base = { isError: false, isReady: true, canWrite: true, hasFile: true, rows: [] }

    it('puts an error first, then loading, read-only, not found, unreadable', () => {
        expect(
            bankImportPageState({
                isError: true,
                isReady: false,
                canWrite: false,
                hasFile: false,
                rows: null,
            })
        ).toBe('error')
        expect(bankImportPageState({ ...base, isError: true })).toBe('error')
        expect(bankImportPageState({ ...base, isReady: false, canWrite: false })).toBe('loading')
        expect(bankImportPageState({ ...base, canWrite: false })).toBe('readOnly')
        expect(bankImportPageState({ ...base, canWrite: false, hasFile: false, rows: null })).toBe(
            'readOnly'
        )
        expect(bankImportPageState({ ...base, hasFile: false, rows: null })).toBe('notFound')
        expect(bankImportPageState({ ...base, rows: null })).toBe('unreadable')
        expect(bankImportPageState(base)).toBe('ready')
        expect(bankImportPageState({ ...base, rows: [{ line: 1, cells: ['2026-10-01'] }] })).toBe(
            'ready'
        )
    })
})

describe('columnOptions', () => {
    it('names each column by the text of the first row', () => {
        expect(columnOptions(BANK_IMPORT_CHECKING_ROWS, 5)).toEqual([
            { value: '1', label: 'Column 1: Posted Date' },
            { value: '2', label: 'Column 2: Payee' },
            { value: '3', label: 'Column 3: Debit' },
            { value: '4', label: 'Column 4: Credit' },
            { value: '5', label: 'Column 5: Balance' },
        ])
    })

    it('cuts a long cell to 29 characters and an ellipsis, and names a blank cell by number', () => {
        expect(BANK_IMPORT_LONG_PAYEE).toHaveLength(70)
        const rows = [{ line: 1, cells: ['10/05/2026', BANK_IMPORT_LONG_PAYEE, '  '] }]
        expect(columnOptions(rows, 3).map(option => option.label)).toEqual([
            'Column 1: 10/05/2026',
            `Column 2: ${BANK_IMPORT_LONG_PAYEE.slice(0, 29)}…`,
            'Column 3',
        ])
    })
})

describe('dateFormatOptions', () => {
    it('shows the first date in each format that reads it, else a fixed example', () => {
        expect(dateFormatOptions('10/01/2026')).toEqual([
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (10/01/2026)' },
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (10/01/2026)' },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-09-30)' },
            { value: 'MM/DD/YY', label: 'MM/DD/YY (09/30/26)' },
            { value: 'DD/MM/YY', label: 'DD/MM/YY (30/09/26)' },
        ])
    })

    it('shows the fixed examples when there is no date', () => {
        expect(dateFormatOptions('').map(option => option.label)).toEqual([
            'MM/DD/YYYY (09/30/2026)',
            'DD/MM/YYYY (30/09/2026)',
            'YYYY-MM-DD (2026-09-30)',
            'MM/DD/YY (09/30/26)',
            'DD/MM/YY (30/09/26)',
        ])
    })
})

describe('keepChoice', () => {
    it('chooses every ready line the first time', () => {
        expect(keepChoice({ chosen: [], seen: [] }, [2, 3, 5])).toEqual([2, 3, 5])
    })

    it('keeps the choice, chooses lines ready for the first time and drops lines no longer ready', () => {
        // 2 chosen and still ready; 3 seen and unchosen; 4 chosen but now an error;
        // 6 ready for the first time.
        const previous = { chosen: [4, 2], seen: [2, 3, 4] }
        expect(keepChoice(previous, [2, 3, 6])).toEqual([2, 6])
    })
})

describe('samplePreview', () => {
    const guessed: BankImportFormValues = {
        ...formFromMapping(BANK_IMPORT_GUESSED_MAPPING),
        lines: [],
    }

    it('reads the first 3 body rows with a complete mapping', () => {
        const preview = samplePreview(BANK_IMPORT_CHECKING_ROWS, guessed, 5)
        expect(preview.isComplete).toBe(true)
        expect(preview.lines).toHaveLength(3)
        expect(preview.lines[0]).toEqual({
            line: 2,
            dateText: 'Oct 1, 2026',
            description: 'Harbor Design – client payment',
            amountText: '$3,100.00',
            error: '',
        })
        expect(preview.lines[1]).toMatchObject({ line: 3, amountText: '-$64.20' })
    })

    it('reads the rows again with another date format', () => {
        const preview = samplePreview(
            BANK_IMPORT_CHECKING_ROWS,
            { ...guessed, date_format: 'DD/MM/YYYY' },
            5
        )
        expect(preview.lines[0].dateText).toBe('Jan 10, 2026')
    })

    it('shows the parser message of a row it cannot read', () => {
        const preview = samplePreview(
            BANK_IMPORT_CHECKING_ROWS,
            { ...guessed, date_format: 'YYYY-MM-DD' },
            5
        )
        expect(preview.lines[0].error).toBe('"10/01/2026" is not a date in the YYYY-MM-DD format.')
    })

    it('shows no rows while a question has no answer', () => {
        const preview = samplePreview(BANK_IMPORT_CHECKING_ROWS, { ...guessed, date_format: '' }, 5)
        expect(preview).toEqual({ isComplete: false, lines: [] })
    })
})

describe('mapIntroText', () => {
    it('says where the mapping came from', () => {
        expect(mapIntroText(false, '1000 Business Checking')).toBe(
            "Books matched your file's columns. Check each one before you continue."
        )
        expect(mapIntroText(true, '1000 Business Checking')).toBe(
            'Books used the columns of your last import to 1000 Business Checking. Check each one before you continue.'
        )
    })
})

describe('statementBalance', () => {
    it('shows a bank account’s statement balance as stated', () => {
        expect(
            statementBalance({ statement_balance: 1042317, statement_date: '2026-10-31' }, 'bank')
        ).toEqual({ cents: 1042317, day: '2026-10-31' })
    })

    it('negates a credit card’s statement balance, so what the card owes reads positive', () => {
        expect(
            statementBalance(
                { statement_balance: -341017, statement_date: '2026-10-28' },
                'credit_card'
            )
        ).toEqual({ cents: 341017, day: '2026-10-28' })
    })

    it('negates a card balance the bank wrote positive', () => {
        expect(
            statementBalance(
                { statement_balance: 5000, statement_date: '2026-10-28' },
                'credit_card'
            )
        ).toEqual({ cents: -5000, day: '2026-10-28' })
    })

    it('has no balance for a file with no statement date', () => {
        expect(statementBalance({ statement_balance: 1042317, statement_date: '' }, 'bank')).toBe(
            null
        )
        expect(statementBalance({ statement_balance: 0, statement_date: '' }, 'credit_card')).toBe(
            null
        )
    })

    it('has no balance with no file', () => {
        expect(statementBalance(undefined, 'bank')).toBe(null)
        expect(statementBalance(undefined, 'credit_card')).toBe(null)
    })
})
