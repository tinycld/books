// The invoice form's own start values: a new form's, a copy's and a correction's. The
// shared values (lines, totals) are in lib/document-values.ts.

import type { BooksInvoices } from '../types'
import { type CustomerFill, customerFills, type TaxRateFill } from './document-fills'
import type { DocumentLineRow } from './document-line-columns'
import { type DocumentFormValuesBase, emptyItemLine, linesWithNewIds } from './document-values'

// The `books:invoice` host's built-in values: the shared ones and the invoice's Terms and
// Due date.
export type InvoiceFormValues = DocumentFormValuesBase & {
    terms: BooksInvoices['terms']
    due_date: string
}

// A new form: dated and due today with one empty Item line and the default message
// (`defaultMessageFor`; none when not given). With a customer (the `?customer` route
// param) the header is filled as a pick fills it.
export function newInvoiceValues(input: {
    today: string
    customer?: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
    message?: string
}): InvoiceFormValues {
    const { today, customer, rates, defaultRateId, message = '' } = input
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
        message,
        memo: '',
    }
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

// Read view "Copy" (`?copy=<id>`): a new draft for the same customer with the same
// lines, tax and message, dated today; no memo, and it replaces nothing. Bill to, Email
// and Terms come from the customer's current record as a customer pick fills them (the
// source's are a snapshot taken for that invoice), and the due date from those terms.
export function copyInvoiceValues(
    invoice: SourceInvoice,
    lines: readonly DocumentLineRow[],
    today: string,
    customer: CustomerFill
): InvoiceFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customerFills(customer, [], today, null)
    return {
        customer: invoice.customer,
        bill_to: fills.bill_to,
        email: fills.email,
        terms: fills.terms ?? '',
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
export function invoiceCorrectionValues(
    invoice: SourceInvoice,
    lines: readonly DocumentLineRow[]
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
