import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in customer columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the customer does not have is refused.
 */
export const customerColumnsSchema = z.strictObject({
    display_name: optionalText,
    company: optionalText,
    first_name: optionalText,
    last_name: optionalText,
    email: optionalText,
    phone: optionalText,
    mobile: optionalText,
    website: optionalText,
    parent: optionalText,
    billing_address: storedAddressSchema.nullable().optional(),
    shipping_address: storedAddressSchema.nullable().optional(),
    notes: optionalText,
})

export type CustomerColumns = z.infer<typeof customerColumnsSchema>

export function customerColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<CustomerColumns> {
    return parseColumns(customerColumnsSchema, columns)
}

// Every form field of a new customer, empty. The create form starts from these: a field
// with no starting value is added to react-hook-form's values as undefined when its
// input mounts, and then a value typed and deleted again never compares equal to the
// start, so the form would stay dirty.
export const EMPTY_CUSTOMER_FIELDS: Required<CustomerColumns> = {
    display_name: '',
    company: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mobile: '',
    website: '',
    parent: '',
    billing_address: null,
    shipping_address: null,
    notes: '',
}

// The base of an insert, so a column the form left out is stored empty.
export const EMPTY_CUSTOMER_COLUMNS: Required<CustomerColumns> & { inactive: boolean } = {
    ...EMPTY_CUSTOMER_FIELDS,
    inactive: false,
}
