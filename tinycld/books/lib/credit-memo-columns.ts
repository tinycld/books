import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in credit memo columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the credit memo does not have (Terms, Due date) is
 * refused.
 */
export const creditMemoColumnsSchema = z.strictObject({
    customer: optionalText,
    bill_to: storedAddressSchema.nullable().optional(),
    email: optionalText,
    date: optionalText,
    tax_rate: optionalText,
    message: optionalText,
    memo: optionalText,
    // The invoice a credit memo is made from (spec §3.2). Not drawn as a field: the
    // save adds it to the columns, and the server checks it.
    invoice: optionalText,
})

export type CreditMemoColumns = z.infer<typeof creditMemoColumnsSchema>

export function creditMemoColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<CreditMemoColumns> {
    return parseColumns(creditMemoColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new credit
// memo is always a draft; `replaces` is set by a correction, `invoice` by a memo started
// from an invoice or a correction of a linked memo.
export const EMPTY_CREDIT_MEMO_COLUMNS: Required<CreditMemoColumns> & {
    status: 'draft'
    replaces: string
} = {
    customer: '',
    bill_to: null,
    email: '',
    date: '',
    tax_rate: '',
    message: '',
    memo: '',
    invoice: '',
    status: 'draft',
    replaces: '',
}
