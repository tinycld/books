// A sales document form's shared values: the built-ins every kind has, the lines a save
// writes, and the totals the form shows while it is typed in. Each kind's own start
// values (new, copy, correction) live with the kind (lib/invoice-values.ts).

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { newRecordId } from 'pbtsdb/core'
import type { BooksInvoices, BooksSettings } from '../types'
import { DOCUMENT_LINE_MAPPER, type DocumentLineRow } from './document-line-columns'
import {
    type DocumentLineInput,
    type DocumentTax,
    type DocumentTotals,
    documentTotals,
} from './document-lines'
import { parseMoney } from './money-text'
import type { DocumentLineTable } from './sales-document-kinds'

// The built-ins both kinds' hosts have, keyed as the engine keys them. `replaces` is no
// built-in: a correction's save writes it with the new document.
export type DocumentFormValuesBase = FormValues & {
    replaces?: string
    // An invoice's: the estimate it is made from (Convert to invoice, or kept by a
    // correction). Like `replaces`, no field of the form: the save writes it.
    estimate?: string
    customer: string
    bill_to: BooksInvoices['bill_to']
    email: string
    date: string
    tax_rate: string
    lines: TableRow[]
    message: string
    memo: string
}

// The message a new blank form starts with: the Books setting "Default message to
// customer" ('' while the settings row is not read). A copy and a correction keep their
// source's message instead.
export function defaultMessageFor(
    settings: Pick<BooksSettings, 'default_customer_message'> | undefined
): string {
    return settings?.default_customer_message ?? ''
}

export function emptyItemLine(): TableRow {
    return {
        id: newRecordId(),
        kind: 'item',
        product: '',
        description: '',
        quantity: 1,
        rate: '',
        amount: null,
        taxable: false,
    }
}

function isBlank(value: unknown): boolean {
    return typeof value !== 'string' || value.trim() === ''
}

// A stored document's lines as form rows in position order, each with a new id: the
// form inserts them as lines of a new document, never as the source's rows.
export function linesWithNewIds(lines: readonly DocumentLineRow[]): TableRow[] {
    return tableRowsOf(lines, DOCUMENT_LINE_MAPPER).map(row => ({ ...row, id: newRecordId() }))
}

// The spec drops an empty trailing Item line (no product, no description) or account line
// (no account, no description, no amount) at save, so the line a new form starts with
// never blocks a save.
export function documentLinesForSave(lines: TableRow[]): TableRow[] {
    const last = lines[lines.length - 1]
    const isEmptyItem = last?.kind === 'item' && isBlank(last.product) && isBlank(last.description)
    const isEmptyAccount =
        last?.kind === 'account' &&
        isBlank(last.account) &&
        isBlank(last.description) &&
        isBlank(last.amount)
    return isEmptyItem || isEmptyAccount ? lines.slice(0, -1) : lines
}

// An account line's typed Amount in cents; 0 while it does not parse (the schema shows
// why), as a rate that does not parse is written as 0.
function accountAmountCents(value: unknown): number {
    return typeof value === 'string' ? (parseMoney(value) ?? 0) : 0
}

// A row as the totals read it: the same conversion the save writes (rate and amount
// text to cents, percent text to ppm), so the form shows what the server will compute.
export function documentLinesOf(rows: readonly TableRow[]): DocumentLineInput[] {
    return rows.map((row, index) => {
        if (row.kind === 'account')
            return { kind: 'account', amount: accountAmountCents(row.amount) }
        const record = DOCUMENT_LINE_MAPPER.toRecord(row, index)
        return {
            kind: record.kind,
            quantity: Number.isFinite(record.quantity) ? record.quantity : 0,
            rate: record.rate,
            percentPpm: record.percent_ppm,
            taxable: record.taxable,
        }
    })
}

export function documentTotalsOf(
    values: Pick<DocumentFormValuesBase, 'lines'>,
    tax: DocumentTax
): DocumentTotals {
    return documentTotals(documentLinesOf(values.lines ?? []), tax)
}

// A form's values: each line table's rows under the table's built-in key.
export type DocumentLineTableValues = Readonly<Record<string, unknown>>

// One line table's rows; none while the form holds no list there (a table the kind's
// form does not draw).
export function lineTableRows(values: DocumentLineTableValues, key: string): TableRow[] {
    const rows = values[key]
    return Array.isArray(rows) ? (rows as TableRow[]) : []
}

// The rows of every line table of a kind, in table order: the rows one set of totals
// sums.
export function allLineRows(
    values: DocumentLineTableValues,
    tables: readonly DocumentLineTable[]
): TableRow[] {
    return tables.flatMap(table => lineTableRows(values, table.key))
}

// The subtotal of each table that has a subtotal row and a line whose amount is not 0,
// in table order. A kind with one table has none: its Subtotal row sums that table.
export function lineTableSubtotals(
    values: DocumentLineTableValues,
    tables: readonly DocumentLineTable[]
): { subtotal: NonNullable<DocumentLineTable['subtotal']>; cents: number }[] {
    return tables.flatMap(table => {
        if (!table.subtotal) return []
        const totals = documentTotals(documentLinesOf(lineTableRows(values, table.key)), null)
        const hasAmount = totals.amounts.some(amount => amount !== null && amount !== 0)
        return hasAmount ? [{ subtotal: table.subtotal, cents: totals.subtotal }] : []
    })
}
