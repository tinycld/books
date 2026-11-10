// The invoice form's values: a new form's start, the lines a save writes, and the
// totals the form shows while it is typed in.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { newRecordId } from 'pbtsdb/core'
import type { BooksInvoices } from '../types'
import {
    type DocumentLineInput,
    type DocumentTax,
    type DocumentTotals,
    documentTotals,
} from './document-lines'
import { type CustomerFill, customerFills, type TaxRateFill } from './invoice-fills'
import { INVOICE_LINE_MAPPER } from './invoice-lines'

// The `books:invoice` host's built-in values, keyed as the engine keys them.
export type InvoiceFormValues = FormValues & {
    customer: string
    bill_to: BooksInvoices['bill_to']
    email: string
    terms: BooksInvoices['terms']
    date: string
    due_date: string
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

// A new form: dated and due today with one empty Item line. With a customer (the
// `?customer` route param) the header is filled as a pick fills it.
export function newInvoiceValues(input: {
    today: string
    customer?: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
}): InvoiceFormValues {
    const { today, customer, rates, defaultRateId } = input
    const fills = customer ? customerFills(customer, rates, today, null) : null
    return {
        customer: customer?.id ?? '',
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        terms: fills?.terms ?? '',
        date: today,
        due_date: fills?.due_date ?? today,
        tax_rate: fills ? fills.tax_rate : defaultRateId,
        lines: [emptyItemLine()],
        message: '',
        memo: '',
    }
}

function isBlank(value: unknown): boolean {
    return typeof value !== 'string' || value.trim() === ''
}

// The spec drops an empty trailing Item line (no product, no description) at save, so
// the line a new form starts with never blocks a save.
export function invoiceLinesForSave(lines: TableRow[]): TableRow[] {
    const last = lines[lines.length - 1]
    const isEmptyItem = last?.kind === 'item' && isBlank(last.product) && isBlank(last.description)
    return isEmptyItem ? lines.slice(0, -1) : lines
}

// A row as the totals read it: the same conversion the save writes (rate text to
// cents, percent text to ppm), so the form shows what the server will compute.
export function documentLinesOf(rows: readonly TableRow[]): DocumentLineInput[] {
    return rows.map((row, index) => {
        const record = INVOICE_LINE_MAPPER.toRecord(row, index)
        return {
            kind: record.kind,
            quantity: Number.isFinite(record.quantity) ? record.quantity : 0,
            rate: record.rate,
            percentPpm: record.percent_ppm,
            taxable: record.taxable,
        }
    })
}

export function invoiceTotalsOf(values: InvoiceFormValues, tax: DocumentTax): DocumentTotals {
    return documentTotals(documentLinesOf(values.lines ?? []), tax)
}
