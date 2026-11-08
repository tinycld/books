// The pure rules of the bank import page: which rows can be chosen, the summary, the
// selection totals, the select-all box and the texts. Kept out of the components so
// tests/bank-import-view.test.ts can drive them with the fixture's files.
import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksBankFiles } from '../types'
import {
    BANK_DATE_FORMATS,
    type BankMapping,
    type BankPreviewRow,
    type BankRow,
    parseBankDate,
    previewBankRows,
} from './bank-import'
import { type BankImportFormValues, mappingFromForm, mappingIssues } from './bank-import-form'
import { formatMoney } from './money'
import { formatDay } from './register-range'

export type SelectBoxState = 'checked' | 'empty' | 'mixed'

export type ChoiceKind = 'ready' | 'error' | 'already'

export type ChoiceRow = {
    line: number
    kind: ChoiceKind
    isChosen: boolean
    // The ISO day; '' for an error row.
    day: string
    dateText: string
    description: string
    memo: string
    // Signed cents; 0 for an error row.
    amount: number
    amountText: string
    message: string
}

export const BANK_IMPORT_TRANSPORT_TEXT =
    'The import could not be sent. Check your connection and try again.'

const ALREADY_TEXT = 'Already imported'

function cellOf(cells: readonly string[] | undefined, column: number | undefined): string {
    if (!cells || !column || column < 1 || column > cells.length) return ''
    return cells[column - 1].trim()
}

// An error row shows the cells as written, so the person can find them in the file.
function rawAmountText(cells: readonly string[] | undefined, mapping: BankMapping): string {
    if (mapping.amount_columns === 'two') {
        return [cellOf(cells, mapping.money_in_column), cellOf(cells, mapping.money_out_column)]
            .filter(text => text !== '')
            .join(' / ')
    }
    return cellOf(cells, mapping.amount_column)
}

export function choiceRows(input: {
    rows: readonly BankRow[]
    preview: readonly BankPreviewRow[]
    mapping: BankMapping
    already: ReadonlySet<number>
    chosen: ReadonlySet<number>
    currency: string
}): ChoiceRow[] {
    const { mapping, already, chosen, currency } = input
    const cellsByLine = new Map(input.rows.map(row => [row.line, row.cells]))
    return input.preview.map(({ line, result }) => {
        const cells = cellsByLine.get(line)
        if (!result.ok) {
            return {
                line,
                kind: 'error',
                isChosen: false,
                day: '',
                dateText: cellOf(cells, mapping.date_column),
                description: cellOf(cells, mapping.description_column),
                memo: cellOf(cells, mapping.memo_column),
                amount: 0,
                amountText: rawAmountText(cells, mapping),
                message: `Line ${line}: ${result.message}`,
            }
        }
        const txn = result.value
        const isAlready = already.has(line)
        return {
            line,
            kind: isAlready ? 'already' : 'ready',
            isChosen: !isAlready && chosen.has(line),
            day: txn.date,
            dateText: formatDay(txn.date),
            description: txn.description,
            memo: txn.memo,
            amount: txn.amount,
            amountText: isAlready ? ALREADY_TEXT : formatMoney(txn.amount, currency),
            message: '',
        }
    })
}

export function readyLines(
    preview: readonly BankPreviewRow[],
    already: ReadonlySet<number>
): number[] {
    return preview.filter(row => row.result.ok && !already.has(row.line)).map(row => row.line)
}

// `exceptId` is the import in flight: pbtsdb shows it optimistically, and its lines must
// not read as imported before the server has taken them.
export function alreadyImportedLines(
    earlier: readonly { id: string; lines: unknown }[],
    exceptId: string | null
): Set<number> {
    const lines = new Set<number>()
    for (const row of earlier) {
        if (row.id === exceptId || !Array.isArray(row.lines)) continue
        for (const line of row.lines) {
            if (Number.isInteger(line)) lines.add(line)
        }
    }
    return lines
}

function transactionsText(count: number): string {
    return count === 1 ? '1 transaction' : `${count} transactions`
}

function dayWithoutYear(day: string): string {
    const [year, month, date] = day.split('-').map(Number)
    const parsed = new Date(0)
    parsed.setUTCFullYear(year, month - 1, date)
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function dayRangeText(days: string[]): string {
    if (days.length === 0) return ''
    const sorted = [...days].sort()
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const sameYear = first.slice(0, 4) === last.slice(0, 4)
    const start = sameYear ? dayWithoutYear(first) : formatDay(first)
    return ` from ${start} to ${formatDay(last)}`
}

export function importSummary(rows: readonly ChoiceRow[]): { text: string; tail: string } {
    const days = rows.filter(row => row.day !== '').map(row => row.day)
    const errorCount = rows.filter(row => row.kind === 'error').length
    const alreadyCount = rows.filter(row => row.kind === 'already').length
    const parts = [
        errorCount > 0 ? `${errorCount} with errors` : '',
        alreadyCount > 0 ? `${alreadyCount} already imported` : '',
    ].filter(Boolean)
    return {
        text: `${transactionsText(rows.length)}${dayRangeText(days)}`,
        tail: parts.map(part => ` · ${part}`).join(''),
    }
}

export function selectionTotals(rows: readonly ChoiceRow[]): {
    count: number
    moneyIn: number
    moneyOut: number
} {
    let count = 0
    let moneyIn = 0
    let moneyOut = 0
    for (const row of rows) {
        if (!row.isChosen) continue
        count += 1
        if (row.amount > 0) moneyIn += row.amount
        else moneyOut -= row.amount
    }
    return { count, moneyIn, moneyOut }
}

export function selectionText(
    totals: { count: number; moneyIn: number; moneyOut: number },
    currency: string
): string {
    const moneyIn = formatMoney(totals.moneyIn, currency)
    const moneyOut = formatMoney(totals.moneyOut, currency)
    return `${totals.count} selected · Money in ${moneyIn} · Money out ${moneyOut}`
}

export function selectAllState(rows: readonly ChoiceRow[]): SelectBoxState {
    const ready = rows.filter(row => row.kind === 'ready')
    const chosen = ready.filter(row => row.isChosen).length
    if (chosen === 0) return 'empty'
    return chosen === ready.length ? 'checked' : 'mixed'
}

export function toggleAllLines(rows: readonly ChoiceRow[]): number[] {
    const ready = rows.filter(row => row.kind === 'ready')
    if (ready.length > 0 && ready.every(row => row.isChosen)) return []
    return ready.map(row => row.line)
}

export function toggleLine(
    rows: readonly ChoiceRow[],
    chosen: ReadonlySet<number>,
    line: number
): number[] {
    const next = new Set(chosen)
    if (next.has(line)) next.delete(line)
    else next.add(line)
    return rows.filter(row => next.has(row.line)).map(row => row.line)
}

const STEP_LABELS: Record<BooksBankFiles['format'], readonly string[]> = {
    csv: ['Upload', 'Map columns', 'Choose transactions'],
    ofx: ['Upload', 'Choose transactions'],
}

export function bankImportStepLabels(format: BooksBankFiles['format']): readonly string[] {
    return STEP_LABELS[format] ?? STEP_LABELS.csv
}

export function chooseStepNumber(format: BooksBankFiles['format']): number {
    return bankImportStepLabels(format).length
}

export function errorBandText(count: number, format: BooksBankFiles['format']): string {
    if (format === 'ofx') {
        const rows = count === 1 ? '1 row' : `${count} rows`
        return `Books could not read ${rows} of this OFX file.`
    }
    if (count === 1) {
        return '1 row has an error and cannot be imported. Change the mapping to read it, or import the other rows.'
    }
    return `${count} rows have errors and cannot be imported. Change the mapping to read them, or import the other rows.`
}

export function importButtonText(count: number): string {
    if (count === 0) return 'Import'
    return `Import ${transactionsText(count)}`
}

export function importResultText(input: {
    imported: number
    duplicates: number
    accountLabel: string
}): { headline: string; detail: string } {
    const { imported, duplicates, accountLabel } = input
    if (imported === 0) {
        const chosen =
            duplicates === 1
                ? 'the 1 chosen transaction was'
                : `all ${duplicates} chosen transactions were`
        return { headline: `Nothing new was imported: ${chosen} already in Books.`, detail: '' }
    }
    const headline = `Imported ${transactionsText(imported)} into ${accountLabel}.`
    if (duplicates === 0) return { headline, detail: '' }
    const detail =
        duplicates === 1
            ? '1 chosen transaction was already in Books, so it was skipped.'
            : `${duplicates} chosen transactions were already in Books, so they were skipped.`
    return { headline, detail }
}

// An error row cannot be chosen, so a file whose other rows are all imported has nothing
// left to import.
export function nothingToChoose(rows: readonly ChoiceRow[]): 'empty' | 'allImported' | null {
    if (rows.length === 0) return 'empty'
    const hasReady = rows.some(row => row.kind === 'ready')
    const hasAlready = rows.some(row => row.kind === 'already')
    if (!hasReady && hasAlready) return 'allImported'
    return null
}

export const HEADER_OPTIONS: SelectOption[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
]

export const AMOUNT_COLUMNS_OPTIONS: SelectOption[] = [
    { value: 'one', label: 'One column' },
    { value: 'two', label: 'Two columns: money in and money out' },
]

export const SIGN_OPTIONS: SelectOption[] = [
    { value: 'in_positive', label: 'Money in' },
    { value: 'out_positive', label: 'Money out' },
]

const COLUMN_LABEL_CHARS = 30

// Row 0 is the header when the file has one and the first body row when it has not, so
// the label reads the same row either way.
export function columnOptions(rows: readonly BankRow[], columns: number): SelectOption[] {
    const first = rows[0]?.cells ?? []
    return Array.from({ length: columns }, (_, i) => {
        const chars = [...(first[i] ?? '').trim()]
        const text =
            chars.length > COLUMN_LABEL_CHARS
                ? `${chars.slice(0, COLUMN_LABEL_CHARS - 1).join('')}…`
                : chars.join('')
        const value = String(i + 1)
        const label = text ? `Column ${value}: ${text}` : `Column ${value}`
        return { value, label }
    })
}

const FIXED_DATE_EXAMPLES: Record<(typeof BANK_DATE_FORMATS)[number], string> = {
    'MM/DD/YYYY': '09/30/2026',
    'DD/MM/YYYY': '30/09/2026',
    'YYYY-MM-DD': '2026-09-30',
    'MM/DD/YY': '09/30/26',
    'DD/MM/YY': '30/09/26',
}

// Each format shows the file's own first date when that format reads it, so the person
// sees which reading matches their file.
export function dateFormatOptions(firstDate: string): SelectOption[] {
    const date = firstDate.trim()
    return BANK_DATE_FORMATS.map(format => {
        const example = parseBankDate(date, format).ok ? date : FIXED_DATE_EXAMPLES[format]
        return { value: format, label: `${format} (${example})` }
    })
}

export type ChoiceMemory = { chosen: readonly number[]; seen: readonly number[] }

// After Back and a new mapping: a line still ready keeps its choice, a line ready for the
// first time is chosen, and a line no longer ready drops out. File order.
export function keepChoice(previous: ChoiceMemory, ready: readonly number[]): number[] {
    const seen = new Set(previous.seen)
    const chosen = new Set(previous.chosen)
    return [...ready].sort((a, b) => a - b).filter(line => !seen.has(line) || chosen.has(line))
}

export type SamplePreviewLine = {
    line: number
    dateText: string
    description: string
    amountText: string
    error: string
}

const PREVIEW_ROWS = 3

// Rows are read only once every question has a valid answer; before that a row error would
// quote a gap of the mapping ("… in the  format.") as if the file were wrong.
export function samplePreview(
    rows: readonly BankRow[],
    values: BankImportFormValues,
    columns: number,
    currency = 'USD'
): { isComplete: boolean; lines: SamplePreviewLine[] } {
    if (mappingIssues(values, columns).length > 0) return { isComplete: false, lines: [] }
    const preview = previewBankRows(rows, mappingFromForm(values)).rows.slice(0, PREVIEW_ROWS)
    const lines = preview.map(({ line, result }) => {
        if (!result.ok) {
            return { line, dateText: '', description: '', amountText: '', error: result.message }
        }
        return {
            line,
            dateText: formatDay(result.value.date),
            description: result.value.description,
            amountText: formatMoney(result.value.amount, currency),
            error: '',
        }
    })
    return { isComplete: true, lines }
}

export function mapIntroText(remembered: boolean, accountLabel: string): string {
    if (remembered) {
        return `Books used the columns of your last import to ${accountLabel}. Check each one before you continue.`
    }
    return "Books matched your file's columns. Check each one before you continue."
}

// The balance of the account's latest statement, on the same side as the card's In Books
// balance: a bank states what the account holds, and a card statement states what the card
// owes as a negative ledger balance, so a card's balance is negated. `0 - x` keeps a zero
// balance from turning into -0. No file, or a file with no statement date (every CSV
// file), has no balance.
export function statementBalance(
    file: Pick<BooksBankFiles, 'statement_balance' | 'statement_date'> | undefined,
    accountType: string
): { cents: number; day: string } | null {
    if (!file || file.statement_date === '') return null
    const cents =
        accountType === 'credit_card' ? 0 - file.statement_balance : file.statement_balance
    return { cents, day: file.statement_date }
}

export type BankImportPageState =
    | 'loading'
    | 'error'
    | 'readOnly'
    | 'notFound'
    | 'unreadable'
    | 'ready'

export function bankImportPageState(input: {
    isError: boolean
    isReady: boolean
    canWrite: boolean
    hasFile: boolean
    rows: BankRow[] | null
}): BankImportPageState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (!input.canWrite) return 'readOnly'
    if (!input.hasFile) return 'notFound'
    if (input.rows === null) return 'unreadable'
    return 'ready'
}
