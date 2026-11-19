// The credit memo form's own start values: a new form's, a copy's and a correction's. The
// shared values (lines, totals) are in lib/document-values.ts.

import type { InvoiceSource } from '../hooks/document-data'
import type { BooksCreditMemos } from '../types'
import { type CustomerFill, customerFills, type TaxRateFill } from './document-fills'
import type { DocumentLineRow } from './document-line-columns'
import { type DocumentFormValuesBase, emptyItemLine, linesWithNewIds } from './document-values'
import { CREDIT_MEMO_KIND } from './sales-document-kinds'

// The `books:credit_memo` host's built-in values: the shared ones. A credit memo has no
// Terms and no Due date. `invoice` names the invoice a memo is made from; like
// `replaces`, it is no field of the form: the save writes it.
export type CreditMemoFormValues = DocumentFormValuesBase & {
    invoice?: string
}

// A new form: dated today with one empty Item line and an empty message (Q8: the
// "Default message to customer" setting does not fill a credit memo). With a customer
// (the `?customer` route param) the header is filled as a pick fills it, and an exempt
// customer's line is not taxable.
export function newCreditMemoValues(input: {
    today: string
    customer: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
}): CreditMemoFormValues {
    const { today, customer, rates, defaultRateId } = input
    const fills = customer ? customerFills(customer, rates, today, null, CREDIT_MEMO_KIND) : null
    const line = emptyItemLine()
    const lines = fills?.isExempt ? [{ ...line, taxable: false }] : [line]
    return {
        customer: customer?.id ?? '',
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        date: today,
        tax_rate: fills ? fills.tax_rate : defaultRateId,
        lines,
        message: '',
        memo: '',
    }
}

type SourceCreditMemo = Pick<
    BooksCreditMemos,
    'id' | 'customer' | 'bill_to' | 'email' | 'date' | 'tax_rate' | 'message' | 'memo' | 'invoice'
>

// Read view "Copy" (`?copy=<id>`, Q16): a new draft for the same customer with the same
// lines, tax and message, dated the day given; no memo, no invoice link, and it replaces
// nothing. Bill to and Email come from the customer's current record as a customer pick
// fills them (the source's are a snapshot taken for that memo).
export function copyCreditMemoValues(
    memo: SourceCreditMemo,
    lines: readonly DocumentLineRow[],
    today: string,
    customer: CustomerFill
): CreditMemoFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customerFills(customer, [], today, null, CREDIT_MEMO_KIND)
    return {
        customer: memo.customer,
        bill_to: fills.bill_to,
        email: fills.email,
        date: today,
        tax_rate: memo.tax_rate,
        lines: linesWithNewIds(lines),
        message: memo.message,
        memo: '',
    }
}

// Read view "Create credit memo" on a posted invoice (`?invoice=<id>`, Q20): a new draft
// with the invoice's customer, Bill to, Email and Tax and a copy of every line (kind,
// product, description, quantity, rate or percent, taxable) under new ids, dated the day
// given, with an empty message and an empty memo. It names the invoice in `invoice`; it
// has no Terms, Due date or estimate, and replaces nothing. Bill to and Email are the
// invoice's snapshot, not the customer's current record, so the customer fill is not
// read: the kind's `values.fromSource` passes it for its `invoice` source. A customer that became inactive
// is kept, as the Customer picker keeps a correction's; Post is refused by the server.
export function creditMemoValuesFromInvoice(
    invoice: Pick<InvoiceSource, 'id' | 'customer' | 'bill_to' | 'email' | 'tax_rate'>,
    lines: readonly DocumentLineRow[],
    today: string,
    _customer: CustomerFill
): CreditMemoFormValues {
    return {
        customer: invoice.customer,
        bill_to: invoice.bill_to,
        email: invoice.email,
        date: today,
        tax_rate: invoice.tax_rate,
        lines: linesWithNewIds(lines),
        message: '',
        memo: '',
        invoice: invoice.id,
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted memo,
// its memo and its invoice link included, with new line ids, and names the memo it
// replaces. It keeps a customer that has become inactive (the server lets a correction
// keep its original's).
export function creditMemoCorrectionValues(
    memo: SourceCreditMemo,
    lines: readonly DocumentLineRow[]
): CreditMemoFormValues {
    return {
        customer: memo.customer,
        bill_to: memo.bill_to,
        email: memo.email,
        date: memo.date,
        tax_rate: memo.tax_rate,
        lines: linesWithNewIds(lines),
        message: memo.message,
        memo: memo.memo,
        replaces: memo.id,
        invoice: memo.invoice,
    }
}
