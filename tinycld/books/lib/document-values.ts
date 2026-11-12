// A sales document form's shared values: the built-ins every kind has, the lines a save
// writes, and the totals the form shows while it is typed in. Each kind's own start
// values (new, copy, correction) live with the kind (lib/invoice-values.ts).

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { newRecordId } from 'pbtsdb/core'
import type { BooksInvoices } from '../types'
import { DOCUMENT_LINE_MAPPER, type DocumentLineRow } from './document-line-columns'
import {
    type DocumentLineInput,
    type DocumentTax,
    type DocumentTotals,
    documentTotals,
} from './document-lines'

// The built-ins both kinds' hosts have, keyed as the engine keys them. `replaces` is no
// built-in: a correction's save writes it with the new document.
export type DocumentFormValuesBase = FormValues & {
    replaces?: string
    customer: string
    bill_to: BooksInvoices['bill_to']
    email: string
    date: string
    tax_rate: string
    lines: TableRow[]
    message: string
    memo: string
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

// The spec drops an empty trailing Item line (no product, no description) at save, so
// the line a new form starts with never blocks a save.
export function documentLinesForSave(lines: TableRow[]): TableRow[] {
    const last = lines[lines.length - 1]
    const isEmptyItem = last?.kind === 'item' && isBlank(last.product) && isBlank(last.description)
    return isEmptyItem ? lines.slice(0, -1) : lines
}

// A row as the totals read it: the same conversion the save writes (rate text to
// cents, percent text to ppm), so the form shows what the server will compute.
export function documentLinesOf(rows: readonly TableRow[]): DocumentLineInput[] {
    return rows.map((row, index) => {
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
