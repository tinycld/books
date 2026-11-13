import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in sales receipt columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the receipt does not have (Terms, Due date) is
 * refused.
 */
export const salesReceiptColumnsSchema = z.strictObject({
    customer: optionalText,
    bill_to: storedAddressSchema.nullable().optional(),
    email: optionalText,
    date: optionalText,
    tax_rate: optionalText,
    payment_method: z.enum(PAYMENT_METHOD_KEYS).or(z.literal('')).optional(),
    reference_no: optionalText,
    deposit_to: optionalText,
    message: optionalText,
    memo: optionalText,
})

export type SalesReceiptColumns = z.infer<typeof salesReceiptColumnsSchema>

export function salesReceiptColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<SalesReceiptColumns> {
    return parseColumns(salesReceiptColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new receipt
// is always a draft; `replaces` is set by a correction.
export const EMPTY_SALES_RECEIPT_COLUMNS: Required<SalesReceiptColumns> & {
    status: 'draft'
    replaces: string
} = {
    customer: '',
    bill_to: null,
    email: '',
    date: '',
    tax_rate: '',
    payment_method: '',
    reference_no: '',
    deposit_to: '',
    message: '',
    memo: '',
    status: 'draft',
    replaces: '',
}
