// The estimate form's own start values: a new form's and a copy's. A quote has no
// correction. The shared values (lines, totals) are in lib/document-values.ts.

import type { EstimateSourceRow } from '../hooks/estimate-data'
import type { BooksEstimates } from '../types'
import { type CustomerFill, customerFills, type TaxRateFill } from './document-fills'
import type { DocumentLineRow } from './document-line-columns'
import { type DocumentFormValuesBase, emptyItemLine, linesWithNewIds } from './document-values'
import { ESTIMATE_KIND } from './sales-document-kinds'

// The `books:estimate` host's built-in values: the shared ones, Expiration date and the
// status row. An estimate has no Terms and no Due date, and Closed is never chosen.
export type EstimateFormValues = DocumentFormValuesBase & {
    status: Exclude<BooksEstimates['status'], 'closed'>
    expiration_date: string
    accepted_by: string
    accepted_date: string
}

// The values a new estimate starts with besides the header and the lines: Pending, no
// expiration date (spec §3.3) and no acceptance.
const OPEN_STATUS_ROW = {
    status: 'pending',
    expiration_date: '',
    accepted_by: '',
    accepted_date: '',
} as const

// A new form: Pending, dated today, with one empty Item line and the default message
// (`defaultMessageFor`). With a customer (the `?customer` route param) the header is
// filled as a pick fills it, and an exempt customer's line is not taxable.
export function newEstimateValues(input: {
    today: string
    customer: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
    message: string
}): EstimateFormValues {
    const { today, customer, rates, defaultRateId, message } = input
    const fills = customer ? customerFills(customer, rates, today, null, ESTIMATE_KIND) : null
    const line = emptyItemLine()
    const lines = fills?.isExempt ? [{ ...line, taxable: false }] : [line]
    return {
        customer: customer?.id ?? '',
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        date: today,
        tax_rate: fills ? fills.tax_rate : defaultRateId,
        ...OPEN_STATUS_ROW,
        lines,
        message,
        memo: '',
    }
}

// Read view "Copy" (`?copy=<id>`): a new Pending estimate for the same customer with the
// same lines (every kind, in order, with new ids), tax and message, dated the day given;
// no expiration date, no acceptance and no memo. Bill to and Email come from the
// customer's current record as a customer pick fills them, as an invoice copy's do (the
// source's are a snapshot taken for that estimate).
export function copyEstimateValues(
    estimate: Pick<EstimateSourceRow, 'customer' | 'tax_rate' | 'message'>,
    lines: readonly DocumentLineRow[],
    today: string,
    customer: CustomerFill
): EstimateFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customerFills(customer, [], today, null, ESTIMATE_KIND)
    return {
        customer: estimate.customer,
        bill_to: fills.bill_to,
        email: fills.email,
        date: today,
        tax_rate: estimate.tax_rate,
        ...OPEN_STATUS_ROW,
        lines: linesWithNewIds(lines),
        message: estimate.message,
        memo: '',
    }
}
