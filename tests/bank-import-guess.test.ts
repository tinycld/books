import { describe, expect, it } from 'vitest'
import type { BankMapping, BankRow } from '../tinycld/books/lib/bank-import'
import { guessBankMapping, mappingFromImport } from '../tinycld/books/lib/bank-import-guess'
import {
    BANK_IMPORT_CARD_MAPPING,
    BANK_IMPORT_CARD_ROWS,
    BANK_IMPORT_CHECKING_ROWS,
    BANK_IMPORT_GUESSED_MAPPING,
} from '../tinycld/books/lib/bank-import-mapping-fixture'

function rowsOf(...lines: string[][]): BankRow[] {
    return lines.map((cells, i) => ({ line: i + 1, cells }))
}

const NOTHING: BankMapping = {
    header_row: false,
    date_column: 0,
    date_format: '',
    description_column: 0,
    amount_columns: '',
    amount_column: 0,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: 'in_positive',
}

// The date format guessed for a "Date,Description,Amount" file whose date cells are `days`.
function formatOf(days: string[]): string {
    const rows = rowsOf(
        ['Date', 'Description', 'Amount'],
        ...days.map(day => [day, 'Coffee', '4.50'])
    )
    return guessBankMapping(rows, 3).date_format
}

describe('guessBankMapping', () => {
    it('guesses the checking export: header, two amount columns, MM/DD/YYYY past bad dates', () => {
        expect(guessBankMapping(BANK_IMPORT_CHECKING_ROWS, 5)).toEqual(BANK_IMPORT_GUESSED_MAPPING)
    })

    it('guesses a Date, Description, Amount file with ISO dates', () => {
        const rows = rowsOf(
            ['Date', 'Description', 'Amount'],
            ['2026-10-01', 'Coffee', '-4.50'],
            ['2026-10-02', 'Rent', '-1,200.00']
        )
        expect(guessBankMapping(rows, 3)).toEqual({
            ...NOTHING,
            header_row: true,
            date_column: 1,
            date_format: 'YYYY-MM-DD',
            description_column: 2,
            amount_columns: 'one',
            amount_column: 3,
        })
    })

    it('takes an equal header before one that only contains a term', () => {
        const rows = rowsOf(
            ['Transaction Date', 'Post Date', 'Description', 'Category', 'Debit', 'Credit'],
            ['10/01/2026', '10/02/2026', 'Coffee', 'Meals', '4.50', ''],
            ['10/03/2026', '10/03/2026', 'Client', 'Income', '', '100.00']
        )
        expect(guessBankMapping(rows, 6)).toEqual({
            ...NOTHING,
            header_row: true,
            date_column: 1,
            date_format: 'MM/DD/YYYY',
            description_column: 3,
            amount_columns: 'two',
            money_in_column: 6,
            money_out_column: 5,
        })
    })

    it('ignores case and punctuation in header text', () => {
        const rows = rowsOf(
            ['Trans. Date', 'Payee', 'Paid in', 'Paid out', 'Balance'],
            ['10/01/2026', 'Coffee', '', '4.50', '95.50'],
            ['10/02/2026', 'Client', '100.00', '', '195.50']
        )
        expect(guessBankMapping(rows, 5)).toEqual({
            ...NOTHING,
            header_row: true,
            date_column: 1,
            date_format: 'MM/DD/YYYY',
            description_column: 2,
            amount_columns: 'two',
            money_in_column: 3,
            money_out_column: 4,
        })
    })

    it('guesses a file with no header from its cells', () => {
        expect(guessBankMapping(BANK_IMPORT_CARD_ROWS, 3)).toEqual({
            ...NOTHING,
            header_row: false,
            date_column: 1,
            date_format: 'MM/DD/YYYY',
            description_column: 2,
            amount_columns: 'one',
            amount_column: 3,
            amount_sign: 'in_positive',
        })
    })

    it('takes the first date format in which every readable date cell reads', () => {
        expect(formatOf(['25/10/2026', '10/02/2026'])).toBe('DD/MM/YYYY')
        expect(formatOf(['10/02/2026', '12/31/2026'])).toBe('MM/DD/YYYY')
        expect(formatOf(['10/02/2026'])).toBe('MM/DD/YYYY')
        expect(formatOf(['2026-13-45'])).toBe('')
    })

    it('leaves every field unchosen when nothing can be guessed', () => {
        const rows = rowsOf(['Foo', 'Bar', 'Baz'], ['a', 'b', 'c'], ['d', 'e', 'f'])
        expect(guessBankMapping(rows, 3)).toEqual({ ...NOTHING, header_row: true })
    })
})

describe('mappingFromImport', () => {
    it("returns an earlier import's mapping when its columns are in the file", () => {
        expect(mappingFromImport(BANK_IMPORT_CARD_MAPPING, 3)).toEqual(BANK_IMPORT_CARD_MAPPING)
    })

    it('returns null when a column it names is not in the file', () => {
        expect(mappingFromImport(BANK_IMPORT_CARD_MAPPING, 2)).toBeNull()
        expect(
            mappingFromImport({ ...BANK_IMPORT_GUESSED_MAPPING, money_in_column: 6 }, 5)
        ).toBeNull()
    })

    it('reads only the amount columns of its own layout', () => {
        // One amount column: its zero money in and money out are not columns it names.
        const one = mappingFromImport(BANK_IMPORT_CARD_MAPPING, 3)
        expect(one).not.toBeNull()
        expect(one?.money_in_column).toBe(0)
        expect(one?.money_out_column).toBe(0)
        // Two amount columns: its zero Amount column is not one it names either.
        expect(mappingFromImport(BANK_IMPORT_GUESSED_MAPPING, 5)).toEqual(
            BANK_IMPORT_GUESSED_MAPPING
        )
    })
})
