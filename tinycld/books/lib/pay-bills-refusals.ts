// Where a refused Pay shows (spec §3.5, §9). The batch names the one operation the server
// refused (pbtsdb's BatchMutationError, lib/batch-refusal.ts); the write plan maps it back:
// a payment's `lines.<n>` goes under the Payment cell of that payment's line n's bill, a
// line's own refusal under its bill's cell, the payment's Ref no. under Starting check
// no., Paid from, Payment date and Payment method under their fields, and the rest in the
// form's error summary (the root) with PocketBase's final period.

import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { refusedRecordId } from './batch-refusal'
import type { PayBillsPlanVendor, PayBillsWritePlan } from './pay-bills-plan'
import { messageOnlyRefusal, writeRefusalText } from './refusal'

export type PayBillsRefusalField =
    | 'paid_from'
    | 'date'
    | 'payment_method'
    | 'reference_no'
    | 'root'
    | `payments.${string}`

export type PayBillsRefusal = { field: PayBillsRefusalField; message: string }

const HEADER_FIELDS = new Set<PayBillsRefusalField>([
    'paid_from',
    'date',
    'payment_method',
    'reference_no',
])

const LINE_KEY = /^lines\.(\d+)$/

function rowField(bill: string): PayBillsRefusalField {
    return `payments.${bill}.amount`
}

function isHeaderField(key: string): key is PayBillsRefusalField {
    return HEADER_FIELDS.has(key as PayBillsRefusalField)
}

// A payment's field key as a form field; null for a key the form does not draw.
function paymentKeyField(key: string, vendor: PayBillsPlanVendor): PayBillsRefusalField | null {
    if (isHeaderField(key)) return key
    const match = LINE_KEY.exec(key)
    if (!match) return null
    const position = Number(match[1])
    const line = vendor.lines.find(row => row.position === position)
    return line ? rowField(line.bill) : null
}

function paymentRefusals(error: unknown, vendor: PayBillsPlanVendor): PayBillsRefusal[] {
    const message = messageOnlyRefusal(error)
    if (message !== null) return [{ field: 'root', message }]
    const fields = extractValidationErrors(error)
    if (!fields || Object.keys(fields).length === 0) {
        return [{ field: 'root', message: writeRefusalText(error) }]
    }
    const placed: PayBillsRefusal[] = []
    const unplaced: string[] = []
    for (const [key, text] of Object.entries(fields)) {
        const field = paymentKeyField(key, vendor)
        if (field === null) unplaced.push(text)
        else placed.push({ field, message: text })
    }
    if (unplaced.length > 0) placed.push({ field: 'root', message: unplaced.join(' ') })
    return placed
}

// A line's refusal, whatever field it names, is about its bill.
function lineRefusalText(error: unknown): string {
    const message = messageOnlyRefusal(error)
    if (message !== null) return message
    const fields = extractValidationErrors(error)
    const texts = fields ? Object.values(fields) : []
    return texts.length > 0 ? texts.join(' ') : writeRefusalText(error)
}

/**
 * A refused Pay's messages by the form path each shows under ('root' for the summary). A
 * refusal of no operation the plan holds (or no batch refusal at all) goes to the summary.
 */
export function payBillsRefusalErrors(plan: PayBillsWritePlan, error: unknown): PayBillsRefusal[] {
    const recordId = refusedRecordId(error)
    const payment = plan.vendors.find(vendor => vendor.paymentId === recordId)
    if (payment) return paymentRefusals(error, payment)
    const line = plan.vendors.flatMap(vendor => vendor.lines).find(row => row.id === recordId)
    if (line) return [{ field: rowField(line.bill), message: lineRefusalText(error) }]
    return [{ field: 'root', message: writeRefusalText(error) }]
}
