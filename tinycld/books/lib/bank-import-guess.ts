// The first mapping of a CSV file on the Map columns step. Books guesses only to save
// typing: every guess shows in a select the person checks before they continue, and a
// field Books cannot guess is left unchosen (0 or '') rather than guessed wrong.
// tests/bank-import-guess.test.ts.
import type { BooksBankImports } from '../types'
import {
    BANK_DATE_FORMATS,
    type BankMapping,
    type BankRow,
    parseBankAmount,
    parseBankDate,
} from './bank-import'

const DATE_TERMS = ['date', 'posted', 'posting date', 'transaction date', 'trans date']
const DESCRIPTION_TERMS = ['description', 'payee', 'name', 'details', 'transaction', 'memo']
const AMOUNT_TERMS = ['amount']
const MONEY_IN_TERMS = ['credit', 'deposit', 'deposits', 'money in', 'paid in']
const MONEY_OUT_TERMS = ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out']

const EMPTY_GUESS: BankMapping = {
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

function isDateInSomeFormat(text: string): boolean {
    return BANK_DATE_FORMATS.some(format => parseBankDate(text, format).ok)
}

function isAmount(text: string): boolean {
    return text.trim() !== '' && parseBankAmount(text).ok
}

function isDate(text: string): boolean {
    return text.trim() !== '' && isDateInSomeFormat(text)
}

// Case and punctuation do not count: "Trans. Date" reads as "trans date".
function words(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(word => word !== '')
}

function containsRun(cell: string[], term: string[]): boolean {
    if (term.length === 0 || term.length > cell.length) return false
    for (let start = 0; start + term.length <= cell.length; start++) {
        if (term.every((word, i) => cell[start + i] === word)) return true
    }
    return false
}

// 1-based; 0 when no free column names the field. An equal header beats one that only
// contains a term, so "Transaction Date, Description" reads Description from column 2.
function headerColumn(header: string[][], terms: string[], taken: Set<number>): number {
    const termWords = terms.map(words)
    const free = header
        .map((cell, i) => ({ cell, column: i + 1 }))
        .filter(c => !taken.has(c.column))
    const equal = free.find(({ cell }) =>
        termWords.some(term => cell.length > 0 && term.join(' ') === cell.join(' '))
    )
    if (equal) return equal.column
    const contains = free.find(({ cell }) => termWords.some(term => containsRun(cell, term)))
    return contains?.column ?? 0
}

function cellAt(row: BankRow, column: number): string {
    return (row.cells[column - 1] ?? '').trim()
}

function nonBlankCells(body: readonly BankRow[], column: number): string[] {
    return body.map(row => cellAt(row, column)).filter(text => text !== '')
}

// The first column (1-based) not in `taken` whose non-blank body cells, at least one, all
// pass `test`.
function columnWhere(
    body: readonly BankRow[],
    columns: number,
    taken: Set<number>,
    test: (text: string) => boolean
): number {
    for (let column = 1; column <= columns; column++) {
        if (taken.has(column)) continue
        const cells = nonBlankCells(body, column)
        if (cells.length > 0 && cells.every(test)) return column
    }
    return 0
}

// Cells no format reads ("Pending", "13/45/2026") are left out, so one bad row does not
// leave the whole file without a format.
function guessDateFormat(body: readonly BankRow[], column: number): string {
    if (column === 0) return ''
    const dates = nonBlankCells(body, column).filter(isDateInSomeFormat)
    if (dates.length === 0) return ''
    const format = BANK_DATE_FORMATS.find(f => dates.every(text => parseBankDate(text, f).ok))
    return format ?? ''
}

function isHeaderRow(first: BankRow | undefined): boolean {
    if (!first) return false
    return !first.cells.some(text => isDate(text) || isAmount(text))
}

function guessFromHeader(header: string[][]): Omit<BankMapping, 'header_row' | 'date_format'> {
    const taken = new Set<number>()
    const take = (terms: string[]) => {
        const column = headerColumn(header, terms, taken)
        if (column > 0) taken.add(column)
        return column
    }
    const date_column = take(DATE_TERMS)
    const description_column = take(DESCRIPTION_TERMS)
    const amount_column = take(AMOUNT_TERMS)
    const money_in_column = take(MONEY_IN_TERMS)
    const money_out_column = take(MONEY_OUT_TERMS)
    if (amount_column > 0) {
        return {
            ...EMPTY_GUESS,
            date_column,
            description_column,
            amount_columns: 'one',
            amount_column,
        }
    }
    if (money_in_column > 0 && money_out_column > 0) {
        return {
            ...EMPTY_GUESS,
            date_column,
            description_column,
            amount_columns: 'two',
            money_in_column,
            money_out_column,
        }
    }
    return { ...EMPTY_GUESS, date_column, description_column }
}

function guessFromCells(
    body: readonly BankRow[],
    columns: number
): Omit<BankMapping, 'header_row' | 'date_format'> {
    const taken = new Set<number>()
    const date_column = columnWhere(body, columns, taken, isDateInSomeFormat)
    if (date_column > 0) taken.add(date_column)
    const amount_column = columnWhere(body, columns, taken, text => parseBankAmount(text).ok)
    if (amount_column > 0) taken.add(amount_column)
    const description_column = columnWhere(body, columns, taken, () => true)
    return {
        ...EMPTY_GUESS,
        date_column,
        description_column,
        amount_columns: amount_column > 0 ? 'one' : '',
        amount_column,
    }
}

export function guessBankMapping(rows: readonly BankRow[], columns: number): BankMapping {
    const header_row = isHeaderRow(rows[0])
    const body = header_row ? rows.slice(1) : rows
    const fields = header_row
        ? guessFromHeader(Array.from({ length: columns }, (_, i) => words(rows[0].cells[i] ?? '')))
        : guessFromCells(body, columns)
    return {
        ...fields,
        header_row,
        date_format: guessDateFormat(body, fields.date_column),
        amount_sign: 'in_positive',
    }
}

type ImportMapping = Pick<
    BooksBankImports,
    | 'header_row'
    | 'date_column'
    | 'date_format'
    | 'description_column'
    | 'amount_columns'
    | 'amount_column'
    | 'money_in_column'
    | 'money_out_column'
    | 'amount_sign'
>

// An earlier import's mapping, or null when a column it names is not in this file. Only
// the amount columns of its own layout count: a one-column import stores 0 for money in
// and money out.
export function mappingFromImport(row: ImportMapping, columns: number): BankMapping | null {
    const named = [row.date_column, row.description_column]
    if (row.amount_columns === 'one') named.push(row.amount_column)
    if (row.amount_columns === 'two') named.push(row.money_in_column, row.money_out_column)
    if (named.some(column => column < 1 || column > columns)) return null
    return {
        header_row: row.header_row,
        date_column: row.date_column,
        date_format: row.date_format,
        description_column: row.description_column,
        amount_columns: row.amount_columns,
        amount_column: row.amount_column,
        money_in_column: row.money_in_column,
        money_out_column: row.money_out_column,
        amount_sign: row.amount_sign,
    }
}
