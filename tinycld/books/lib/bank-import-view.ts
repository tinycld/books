// The pure rules of the bank import page: which rows can be chosen, the summary, the
// selection totals, the select-all box and the texts. Kept out of the components so
// tests/bank-import-view.test.ts can drive them with the fixture's files.
import type { BooksBankFiles } from '../types'
import type { BankMapping, BankPreviewRow, BankRow } from './bank-import'
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
