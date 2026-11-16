// Where a server refusal of a payment save shows (spec §3.6): under the field it names,
// under the Payment cell of the application it numbers (`applications.<position>`), else
// in the form's error summary (the root) with its final period.

import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { type FieldErrors, set } from 'react-hook-form'
import type { PaymentFormValues } from './payment-values'
import { messageOnlyRefusal, writeRefusalText } from './refusal'

// The form fields a server refusal names with the form's own field names.
const FIELD_KEYS = new Set(['customer', 'date', 'deposit_to', 'reference_no', 'amount'])

const APPLICATION_KEY = /^applications\.(\d+)$/

// The form's setError, typed by its use here so this module needs no form hook. Method
// syntax, so react-hook-form's setError (typed by the form's field paths) fits.
export type PaymentRefusalForm = {
    setError(name: string, error: { type: string; message: string }): void
}

// A stored application of the save, by its `position`.
export type StoredApplication = { id: string; invoice: string; position: number }

// The form field of a refusal key; null for a key the form does not draw.
function refusalField(key: string, stored: readonly StoredApplication[]): string | null {
    if (FIELD_KEYS.has(key)) return key
    const match = APPLICATION_KEY.exec(key)
    if (!match) return null
    const position = Number(match[1])
    const application = stored.find(row => row.position === position)
    return application ? `payments.${application.invoice}.amount` : null
}

// A refusal's messages by the form path each shows under ('root' for the summary).
export function paymentRefusals(
    error: unknown,
    stored: readonly StoredApplication[]
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
        const field = refusalField(key, stored)
        if (field === null) unplaced.push(text)
        else placed.push({ field, message: text })
    }
    if (unplaced.length > 0) placed.push({ field: 'root', message: unplaced.join(' ') })
    return placed
}

export function paymentRefusalHandler(
    form: PaymentRefusalForm,
    stored: readonly StoredApplication[]
): (error: unknown) => void {
    return error => {
        for (const { field, message } of paymentRefusals(error, stored)) {
            form.setError(field, { type: 'server', message })
        }
    }
}

// The same refusal as form errors (react-hook-form's nested shape), for a form that
// starts with it: the draft's form after a new payment's save handed it over.
export function paymentRefusalErrors(
    error: unknown,
    stored: readonly StoredApplication[]
): FieldErrors<PaymentFormValues> {
    const errors: FieldErrors<PaymentFormValues> = {}
    for (const { field, message } of paymentRefusals(error, stored)) {
        set(errors, field, { type: 'server', message })
    }
    return errors
}
