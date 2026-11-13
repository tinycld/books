import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { PAYMENT_TERM_KEYS } from './payment-terms'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in invoice columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the invoice does not have is refused.
 */
export const invoiceColumnsSchema = z.strictObject({
    customer: optionalText,
    bill_to: storedAddressSchema.nullable().optional(),
    email: optionalText,
    terms: z.enum(PAYMENT_TERM_KEYS).or(z.literal('')).optional(),
    date: optionalText,
    due_date: optionalText,
    tax_rate: optionalText,
    message: optionalText,
    memo: optionalText,
    // The estimate an invoice is made from (Convert to invoice). Not drawn as a field;
    // the server refuses any change after the create.
    estimate: optionalText,
})

export type InvoiceColumns = z.infer<typeof invoiceColumnsSchema>

export function invoiceColumnsFrom(columns: Record<string, unknown>): ColumnsParse<InvoiceColumns> {
    return parseColumns(invoiceColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new invoice is
// always a draft; `replaces` is set by a correction, `estimate` by Convert to invoice.
export const EMPTY_INVOICE_COLUMNS: Required<InvoiceColumns> & {
    status: 'draft'
    replaces: string
} = {
    customer: '',
    bill_to: null,
    email: '',
    terms: '',
    date: '',
    due_date: '',
    tax_rate: '',
    message: '',
    memo: '',
    estimate: '',
    status: 'draft',
    replaces: '',
}
