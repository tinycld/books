import { z } from '@tinycld/core/ui/form'
import type { AddressPart } from './address'

// A stored address has exactly the six parts, each a string. Only the shape is checked
// here. The 200-character limit belongs to the server, which refuses a longer part on
// the address field with its own message, and to the address inputs' local schemas
// (lib/host-value-schemas.ts), which show the length error under the part.
const address = z.strictObject({
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    region: z.string(),
    postal_code: z.string(),
    country: z.string(),
} satisfies Record<AddressPart, z.ZodString>)

const text = z.string().optional()

/**
 * The built-in customer columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the customer does not have is refused.
 */
export const customerColumnsSchema = z.strictObject({
    display_name: text,
    company: text,
    first_name: text,
    last_name: text,
    email: text,
    phone: text,
    mobile: text,
    website: text,
    parent: text,
    billing_address: address.nullable().optional(),
    shipping_address: address.nullable().optional(),
    notes: text,
})

export type CustomerColumns = z.infer<typeof customerColumnsSchema>

export function customerColumnsFrom(
    columns: Record<string, unknown>
): { success: true; columns: CustomerColumns } | { success: false; error: z.ZodError } {
    const parsed = customerColumnsSchema.safeParse(columns)
    if (!parsed.success) return { success: false, error: parsed.error }
    return { success: true, columns: parsed.data }
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
