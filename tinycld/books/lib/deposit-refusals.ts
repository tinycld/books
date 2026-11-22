// Where a server refusal of a deposit save shows (bank deposit spec §3.7, Decisions,
// Refusal keys): `deposit_to`, `date` and `memo` under those fields; `items.<n>` under the
// row of the item it ranks (lib/deposit.ts `itemLineOfRefusal`), as that row's root error;
// `lines.<n>.<field>` under that line's field; anything else in the form's error summary
// (the root), with PocketBase's final period.

import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { type FieldErrors, set } from 'react-hook-form'
import type { DepositStoredItem } from '../stores/deposit-save-store'
import { itemLineOfRefusal, lineRefusalPath } from './deposit'
import type { DepositFormValues } from './deposit-values'
import { messageOnlyRefusal, writeRefusalText } from './refusal'

const HEADER_FIELDS = new Set(['deposit_to', 'date', 'memo'])
// The fields of an other funds line row. A refusal of one line's own write may name them
// bare (PocketBase's checks of the row's fields), not as `lines.<n>.<field>`.
const LINE_FIELDS = new Set(['account', 'amount', 'description', 'customer', 'vendor'])

// The form's setError, typed by its use here so this module needs no form hook. Method
// syntax, so react-hook-form's setError (typed by the form's field paths) fits.
export type DepositRefusalForm = {
    setError(name: string, error: { type: string; message: string }): void
}

// The form path of a refusal key; null for a key the form does not draw. `ticked` is the
// form's `items` array as submitted: a row's error sits at its index there. `lineAt` is the
// index of the other funds line whose own write was refused (null for any other write):
// a bare line field key shows under that line's field.
function refusalField(
    key: string,
    stored: readonly DepositStoredItem[],
    ticked: readonly { line: string }[],
    lineAt: number | null
): string | null {
    if (lineAt !== null && LINE_FIELDS.has(key)) return `lines.${lineAt}.${key}`
    if (HEADER_FIELDS.has(key)) return key
    const line = itemLineOfRefusal(key, stored)
    if (line !== null) {
        const index = ticked.findIndex(item => item.line === line)
        return index === -1 ? null : `items.${index}.root`
    }
    return lineRefusalPath(key)
}

// A refusal's messages by the form path each shows under ('root' for the summary).
export function depositRefusals(
    error: unknown,
    stored: readonly DepositStoredItem[],
    ticked: readonly { line: string }[],
    lineAt: number | null = null
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
        const field = refusalField(key, stored, ticked, lineAt)
        if (field === null) unplaced.push(text)
        else placed.push({ field, message: text })
    }
    if (unplaced.length > 0) placed.push({ field: 'root', message: unplaced.join(' ') })
    return placed
}

export function depositRefusalHandler(
    form: DepositRefusalForm,
    stored: readonly DepositStoredItem[],
    ticked: readonly { line: string }[],
    lineAt: number | null = null
): (error: unknown) => void {
    return error => {
        for (const { field, message } of depositRefusals(error, stored, ticked, lineAt)) {
            form.setError(field, { type: 'server', message })
        }
    }
}

type ItemErrors = FieldErrors<DepositFormValues>['items']

// An item row's error sits at the row's index in the form's `items` array, so a tick
// change moves it to another row. This gives each row error its index in `next` by the
// row's line (a row no longer ticked loses its error); null when no row has one.
export function itemErrorsAfterTicks(
    errors: ItemErrors,
    before: readonly { line: string }[],
    next: readonly { line: string }[]
): { field: string; error: { type: string; message: string } }[] | null {
    const byLine = new Map<string, { type: string; message: string }>()
    before.forEach((item, index) => {
        const root = errors?.[index]?.root
        if (root?.message) byLine.set(item.line, { type: root.type, message: root.message })
    })
    if (byLine.size === 0) return null
    return next.flatMap((item, index) => {
        const error = byLine.get(item.line)
        return error ? [{ field: `items.${index}.root`, error }] : []
    })
}

// The same refusal as form errors (react-hook-form's nested shape), for the draft's form
// that starts with it after a new deposit's save handed it over.
export function depositRefusalErrors(
    error: unknown,
    stored: readonly DepositStoredItem[],
    ticked: readonly { line: string }[],
    lineAt: number | null = null
): FieldErrors<DepositFormValues> {
    const errors: FieldErrors<DepositFormValues> = {}
    for (const { field, message } of depositRefusals(error, stored, ticked, lineAt)) {
        set(errors, field, { type: 'server', message })
    }
    return errors
}
