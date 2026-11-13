import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

// The books_estimates schema's `accepted_by` max, in code points as the server counts it.
const MAX_ACCEPTED_BY = 200

/**
 * The built-in estimate columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the estimate does not have (Terms, Due date) is
 * refused. Status is one the user chooses: only the server sets Closed.
 */
export const estimateColumnsSchema = z.strictObject({
    customer: optionalText,
    bill_to: storedAddressSchema.nullable().optional(),
    email: optionalText,
    date: optionalText,
    expiration_date: optionalText,
    tax_rate: optionalText,
    status: z.enum(['pending', 'accepted', 'rejected']).optional(),
    accepted_by: z
        .string()
        .refine(text => [...text].length <= MAX_ACCEPTED_BY)
        .optional(),
    accepted_date: optionalText,
    message: optionalText,
    memo: optionalText,
})

export type EstimateColumns = z.infer<typeof estimateColumnsSchema>

export function estimateColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<EstimateColumns> {
    return parseColumns(estimateColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new estimate
// is Pending unless the form chose another status.
export const EMPTY_ESTIMATE_COLUMNS: Required<EstimateColumns> = {
    customer: '',
    bill_to: null,
    email: '',
    date: '',
    expiration_date: '',
    tax_rate: '',
    status: 'pending',
    accepted_by: '',
    accepted_date: '',
    message: '',
    memo: '',
}
