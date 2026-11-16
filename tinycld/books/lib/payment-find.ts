// Find invoice no. with no customer chosen (spec §3.5): what a lookup of an invoice number
// across the posted invoices with an open balance comes to.

import { z } from '@tinycld/core/ui/form'
import type { OutstandingRow } from './payment-allocation'
import { PAYMENT_MESSAGES } from './payment-texts'

// The Find invoice no. field: an invoice number is at most 40 characters (books_invoices).
export const FIND_INVOICE_MAX = 40

export const findInvoiceSchema = z.object({
    find: z.string().max(FIND_INVOICE_MAX, PAYMENT_MESSAGES.findTooLong),
})

export type FindValues = z.infer<typeof findInvoiceSchema>

export type FindResult =
    | { kind: 'picked'; invoice: OutstandingRow; customer: string }
    | { kind: 'miss' }
    | { kind: 'inactive'; customerName: string }
    | { kind: 'failed' }

export type FindMatch = {
    invoice: OutstandingRow
    customer: { id: string; name: string; active: boolean }
}

// One match picks it, unless its customer is inactive. No match is a miss, and so are two:
// numbers are unique per sequence, so two matches cannot be told apart by the number.
export function findOutcome(matches: readonly FindMatch[]): FindResult {
    if (matches.length !== 1) return { kind: 'miss' }
    const [{ invoice, customer }] = matches
    if (!customer.active) return { kind: 'inactive', customerName: customer.name }
    return { kind: 'picked', invoice, customer: customer.id }
}
