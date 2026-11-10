// The invoice form's values: a new form's start, the lines a save writes, and the
// totals the form shows while it is typed in.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
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
import { INVOICE_LINE_MAPPER, type InvoiceLineRow } from './invoice-lines'

// The `books:invoice` host's built-in values, keyed as the engine keys them. `replaces`
// is no built-in: a correction's save writes it with the new invoice.
export type InvoiceFormValues = FormValues & {
    replaces?: string
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

type SourceInvoice = Pick<
    BooksInvoices,
    | 'id'
    | 'customer'
    | 'bill_to'
    | 'email'
    | 'terms'
    | 'date'
    | 'due_date'
    | 'tax_rate'
    | 'message'
    | 'memo'
>

// A stored invoice's lines as form rows in position order, each with a new id: the
// form inserts them as lines of a new invoice, never as the source's rows.
function linesWithNewIds(lines: readonly InvoiceLineRow[]): TableRow[] {
    return tableRowsOf(lines, INVOICE_LINE_MAPPER).map(row => ({ ...row, id: newRecordId() }))
}

// Read view "Copy" (`?copy=<id>`): a new draft for the same customer with the same
// lines, tax and message, dated today; no memo, and it replaces nothing. Bill to, Email
// and Terms come from the customer's current record as a customer pick fills them (the
// source's are a snapshot taken for that invoice), and the due date from those terms.
export function copyInvoiceValues(
    invoice: SourceInvoice,
    lines: readonly InvoiceLineRow[],
    today: string,
    customer: CustomerFill
): InvoiceFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customerFills(customer, [], today, null)
    return {
        customer: invoice.customer,
        bill_to: fills.bill_to,
        email: fills.email,
        terms: fills.terms,
        date: today,
        due_date: fills.due_date ?? today,
        tax_rate: invoice.tax_rate,
        lines: linesWithNewIds(lines),
        message: invoice.message,
        memo: '',
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted
// invoice, with new line ids, and names the invoice it replaces.
export function correctionValues(
    invoice: SourceInvoice,
    lines: readonly InvoiceLineRow[]
): InvoiceFormValues {
    return {
        customer: invoice.customer,
        bill_to: invoice.bill_to,
        email: invoice.email,
        terms: invoice.terms,
        date: invoice.date,
        due_date: invoice.due_date,
        tax_rate: invoice.tax_rate,
        lines: linesWithNewIds(lines),
        message: invoice.message,
        memo: invoice.memo,
        replaces: invoice.id,
    }
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
