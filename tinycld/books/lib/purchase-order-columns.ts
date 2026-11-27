import { z } from '@tinycld/core/ui/form'
import { storedAddressSchema } from './address'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in purchase order columns the form writes. Every key is optional: core
 * `splitValues` leaves out a key whose value is undefined, and an edit patch holds only
 * the dirty keys. Strict, so a column the order does not have is refused. The line tables
 * are rows, not columns; Ship to's bounds are SHIP_TO_SCHEMA's, which the forms engine runs
 * (forms/ui.ts `schemas`). Status is the server's: a form never writes it.
 */
export const purchaseOrderColumnsSchema = z.strictObject({
    vendor: optionalText,
    mailing_address: storedAddressSchema.nullable().optional(),
    email: optionalText,
    date: optionalText,
    ship_to: optionalText,
    message: optionalText,
    memo: optionalText,
})

export type PurchaseOrderColumns = z.infer<typeof purchaseOrderColumnsSchema>

export function purchaseOrderColumnsFrom(
    columns: Record<string, unknown>
): ColumnsParse<PurchaseOrderColumns> {
    return parseColumns(purchaseOrderColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new order is
// always Open (spec §3.6); the server gives it its number in the same write.
export const EMPTY_PURCHASE_ORDER_COLUMNS: Required<PurchaseOrderColumns> & { status: 'open' } = {
    vendor: '',
    mailing_address: null,
    email: '',
    date: '',
    ship_to: '',
    message: '',
    memo: '',
    status: 'open',
}
