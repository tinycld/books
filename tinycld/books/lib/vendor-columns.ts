import { z } from '@tinycld/core/ui/form'
import type { BooksVendors } from '../types'
import { storedAddressSchema } from './address'
import type { ColumnOf } from './fixture-columns'
import { PAYMENT_TERM_KEYS } from './payment-terms'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'
import { TAX_ID_TYPE_KEYS } from './tax-id'

/**
 * The built-in vendor columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the vendor does not have is refused.
 */
export const vendorColumnsSchema = z.strictObject({
    display_name: optionalText,
    company: optionalText,
    first_name: optionalText,
    last_name: optionalText,
    email: optionalText,
    phone: optionalText,
    mobile: optionalText,
    website: optionalText,
    address: storedAddressSchema.nullable().optional(),
    // '' is "None".
    terms: z.enum(PAYMENT_TERM_KEYS).or(z.literal('')).optional(),
    account_number: optionalText,
    expense_account: optionalText,
    track_1099: z.boolean().optional(),
    legal_name: optionalText,
    // '' is a vendor tracked before its W-9 arrives.
    tax_id_type: z.enum(TAX_ID_TYPE_KEYS).or(z.literal('')).optional(),
    tax_id: optionalText,
    notes: optionalText,
})

export type VendorColumns = z.infer<typeof vendorColumnsSchema>

export function vendorColumnsFrom(columns: Record<string, unknown>): ColumnsParse<VendorColumns> {
    return parseColumns(vendorColumnsSchema, columns)
}

// A new vendor is not tracked for 1099 and has no legal name or tax ID.
export const EMPTY_1099_COLUMNS = {
    track_1099: false,
    legal_name: '',
    tax_id_type: '',
    tax_id: '',
} satisfies Pick<
    BooksVendors,
    ColumnOf<BooksVendors, 'track_1099' | 'legal_name' | 'tax_id_type' | 'tax_id'>
>

// Every form field of a new vendor, empty. The create form starts from these: a field
// with no starting value is added to react-hook-form's values as undefined when its
// input mounts, and then a value typed and deleted again never compares equal to the
// start, so the form would stay dirty.
export const EMPTY_VENDOR_FIELDS: Required<VendorColumns> = {
    display_name: '',
    company: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mobile: '',
    website: '',
    address: null,
    terms: '',
    account_number: '',
    expense_account: '',
    notes: '',
    ...EMPTY_1099_COLUMNS,
}

// The base of an insert, so a column the form left out is stored empty. The `satisfies`
// makes tsc refuse it when a parsed column, `terms` above all, drifts from the
// generated row.
export const EMPTY_VENDOR_COLUMNS: Required<VendorColumns> & { inactive: boolean } = {
    ...EMPTY_VENDOR_FIELDS,
    inactive: false,
} satisfies Partial<BooksVendors>
