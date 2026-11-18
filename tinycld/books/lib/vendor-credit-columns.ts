import { z } from '@tinycld/core/ui/form'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in vendor credit columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only the
 * dirty keys. Strict, so a column the vendor credit does not have (an address, Terms, a
 * due date) is refused. The line tables are rows, not columns.
 */
export const vendorCreditColumnsSchema = z.strictObject({
    vendor: optionalText,
    date: optionalText,
    ref_no: optionalText,
    memo: optionalText,
})

export type VendorCreditColumns = z.infer<typeof vendorCreditColumnsSchema>

export function vendorCreditColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<VendorCreditColumns> {
    return parseColumns(vendorCreditColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new vendor
// credit is always a draft; `replaces` is set by a correction.
export const EMPTY_VENDOR_CREDIT_COLUMNS: Required<VendorCreditColumns> & {
    status: 'draft'
    replaces: string
} = {
    vendor: '',
    date: '',
    ref_no: '',
    memo: '',
    status: 'draft',
    replaces: '',
}
