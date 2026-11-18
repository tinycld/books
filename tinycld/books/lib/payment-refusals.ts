// Where a server refusal of a payment save shows (receive-payment spec §3.6, vendor refund
// spec §3.6): under the field it names, under the cell of the line it numbers
// (`<flow.lineKey>.<position>`), else in the form's error summary (the root) with its
// final period. The flow names the server's party and account fields.

import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { type FieldErrors, set } from 'react-hook-form'
import type { PaymentFlow } from './payment-flow'
import type { PaymentFormValues } from './payment-values'
import { messageOnlyRefusal, writeRefusalText } from './refusal'

// The server fields every payment flow names as the form does.
const SHARED_FIELDS = ['date', 'reference_no', 'amount'] as const

type RefusalKeys = Pick<PaymentFlow, 'lineKey' | 'serverFields'>

// The form's setError, typed by its use here so this module needs no form hook. Method
// syntax, so react-hook-form's setError (typed by the form's field paths) fits.
export type PaymentRefusalForm = {
    setError(name: string, error: { type: string; message: string }): void
}

// A stored line of the save, by its `position`.
export type StoredApplication = { id: string; document: string; position: number }

// The form field of each server field the flow's form draws.
function fieldMap(flow: RefusalKeys): Map<string, string> {
    return new Map<string, string>([
        [flow.serverFields.party, 'party'],
        [flow.serverFields.account, 'account'],
        ...SHARED_FIELDS.map(field => [field, field] as const),
    ])
}

const LINE_KEY = /^([a-z_]+)\.(\d+)$/

// The form field of a refusal key; null for a key the form does not draw.
function refusalField(
    key: string,
    stored: readonly StoredApplication[],
    flow: RefusalKeys
): string | null {
    const field = fieldMap(flow).get(key)
    if (field !== undefined) return field
    const match = LINE_KEY.exec(key)
    if (!match || match[1] !== flow.lineKey) return null
    const position = Number(match[2])
    const line = stored.find(row => row.position === position)
    return line ? `payments.${line.document}.amount` : null
}

// A refusal's messages by the form path each shows under ('root' for the summary).
export function paymentRefusals(
    error: unknown,
    stored: readonly StoredApplication[],
    flow: RefusalKeys
): { field: string; message: string }[] {
    const message = messageOnlyRefusal(error)
    if (message !== null) return [{ field: 'root', message }]
    const fields = extractValidationErrors(error)
    if (!fields || Object.keys(fields).length === 0) {
        return [{ field: 'root', message: writeRefusalText(error) }]
    }
    const placed: { field: string; message: string }[] = []
    const unplaced: string[] = []
    for (const [key, text] of Object.entries(fields)) {
        const field = refusalField(key, stored, flow)
        if (field === null) unplaced.push(text)
        else placed.push({ field, message: text })
    }
    if (unplaced.length > 0) placed.push({ field: 'root', message: unplaced.join(' ') })
    return placed
}

export function paymentRefusalHandler(
    form: PaymentRefusalForm,
    stored: readonly StoredApplication[],
    flow: RefusalKeys
): (error: unknown) => void {
    return error => {
        for (const { field, message } of paymentRefusals(error, stored, flow)) {
            form.setError(field, { type: 'server', message })
        }
    }
}

// The same refusal as form errors (react-hook-form's nested shape), for a form that
// starts with it: the draft's form after a new payment's save handed it over.
export function paymentRefusalErrors(
    error: unknown,
    stored: readonly StoredApplication[],
    flow: RefusalKeys
): FieldErrors<PaymentFormValues> {
    const errors: FieldErrors<PaymentFormValues> = {}
    for (const { field, message } of paymentRefusals(error, stored, flow)) {
        set(errors, field, { type: 'server', message })
    }
    return errors
}
