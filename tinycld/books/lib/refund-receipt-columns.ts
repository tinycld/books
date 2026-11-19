import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in refund receipt columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the refund does not have (Terms, Due date) is
 * refused. The source link (`sales_receipt`, `credit_memo`) is no field of the form: the
 * save adds the column its link names (useDocumentSave), as a credit memo's `invoice`.
 */
export const refundReceiptColumnsSchema = z.strictObject({
    customer: optionalText,
    bill_to: storedAddressSchema.nullable().optional(),
    email: optionalText,
    date: optionalText,
    tax_rate: optionalText,
    payment_method: z.enum(PAYMENT_METHOD_KEYS).or(z.literal('')).optional(),
    reference_no: optionalText,
    refund_from: optionalText,
    message: optionalText,
    memo: optionalText,
    sales_receipt: optionalText,
    credit_memo: optionalText,
})

export type RefundReceiptColumns = z.infer<typeof refundReceiptColumnsSchema>

export function refundReceiptColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<RefundReceiptColumns> {
    return parseColumns(refundReceiptColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new refund is
// always a draft; `replaces` is set by a correction, a link by a refund started from its
// source or a correction of a linked refund.
export const EMPTY_REFUND_RECEIPT_COLUMNS: Required<RefundReceiptColumns> & {
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
    refund_from: '',
    message: '',
    memo: '',
    status: 'draft',
    replaces: '',
    sales_receipt: '',
    credit_memo: '',
}
