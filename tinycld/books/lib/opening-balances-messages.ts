// These strings mirror refusals in server/opening_balances.go and server/reversal.go.
// tests/opening-balances-messages.test.ts fails if the server wording drifts.
import { extractValidationErrors, isRecord } from '@tinycld/core/lib/errors'
import { formatDay } from './register-range'

export function closedThroughMessage(closeDate: string): string {
    return `Books are closed through ${formatDay(closeDate)}. Pick a later date.`
}

export function alreadyEnteredMessage(number: string): string {
    return `Opening balances are already entered (${number}). Edit that entry.`
}

export const onlyOpeningScreenMessage =
    'An opening balance entry can be edited only on the Opening balances screen.'

export const tooManyAmountsMessage =
    'Too many amounts. Enter 999 or fewer, because the balancing line counts as one.'

export const tooLargeLabel = 'Too large'

export function problemMessage(problem: 'too-large' | 'too-many-lines' | null): string | null {
    if (problem === 'too-large') return tooLargeLabel
    if (problem === 'too-many-lines') return tooManyAmountsMessage
    return null
}

// The server's message for a refusal (a 400 with a body), or null for an error
// that is not a refusal, such as a network failure.
export function refusalMessage(error: unknown): string | null {
    if (!isRecord(error) || !isRecord(error.response)) return null
    const { message } = error.response
    return typeof message === 'string' && message !== '' ? message : null
}

// The message for one refused line: the server's per-field text when the body names
// a field, else the refusal's top-level message (PocketBase's generic one).
export function lineRefusalMessage(error: unknown): string | null {
    const fieldMessage = Object.values(extractValidationErrors(error) ?? {})[0]
    return fieldMessage || refusalMessage(error)
}

// A refusal belongs to the form's fields only when every field it names is one
// (date, memo, amounts.<id>). Anything else (debit, credit, account, entry,
// position) names a column of a line or entry the person cannot see, so the message
// is shown as a whole instead.
export function refusalNamesFormFields(error: unknown, formFields: readonly string[]): boolean {
    const named = extractValidationErrors(error)
    if (!named) return false
    return Object.keys(named).every(key => formFields.includes(key.split('.')[0]))
}
