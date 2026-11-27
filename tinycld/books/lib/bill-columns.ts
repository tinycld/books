import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { PAYMENT_TERM_KEYS } from './payment-terms'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in bill columns the form writes. Every key is optional: core `splitValues`
 * leaves out a key whose value is undefined, and an edit patch holds only the dirty keys.
 * Strict, so a column the bill does not have is refused. The line tables are rows, not
 * columns.
 */
export const billColumnsSchema = z.strictObject({
    vendor: optionalText,
    mailing_address: storedAddressSchema.nullable().optional(),
    terms: z.enum(PAYMENT_TERM_KEYS).or(z.literal('')).optional(),
    date: optionalText,
    due_date: optionalText,
    ref_no: optionalText,
    memo: optionalText,
    // The purchase order a bill is made from (purchase order spec §3.8). Not drawn as a
    // field: the save writes it from the form's source link.
    purchase_order: optionalText,
})

export type BillColumns = z.infer<typeof billColumnsSchema>

export function billColumnsFrom(columns: Record<string, unknown>): ColumnsParse<BillColumns> {
    return parseColumns(billColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new bill is
// always a draft; `replaces` is set by a correction, `purchase_order` by a bill made from
// an order or a correction of one.
export const EMPTY_BILL_COLUMNS: Required<BillColumns> & {
    status: 'draft'
    replaces: string
} = {
    vendor: '',
    mailing_address: null,
    terms: '',
    date: '',
    due_date: '',
    ref_no: '',
    memo: '',
    purchase_order: '',
    status: 'draft',
    replaces: '',
}
