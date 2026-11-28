// Where a server refusal of an inventory adjustment save shows (inventory-adjust spec §3.3):
// a text "Line n: …" (server/inventory_adjustments.go msgAdjustmentLineFault, numbered by
// the stored lines in position order) on that line as the line's root error, with the
// server's own text; a field of one line's own write (the guard names it bare: `product`,
// `quantity`, `bin`, `value`) under that line's input; `date`, `account` and `memo` of a
// header write under those fields; anything else in the form's error summary (the root).
//
// This module places only the "Line n: …" texts and maps a line write's fields to that
// line's inputs. Every other placement, the summary text included (the server's sentence,
// the fields no input shows, the text of a write that reached no server), is core
// `handleMutationErrorsWithForm` with `rootMessage`.
//
// The save leaves blank lines out (lib/adjustment-schema.ts), so the n-th stored line is
// found in the form by its row id, not by its index.

import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { type ErrorOption, type FieldErrors, set } from 'react-hook-form'
import type { AdjustmentValues } from './adjustment-values'
import { messageOnlyRefusal } from './refusal'

// A header write's fields by the form path that shows each.
const HEADER_FIELDS: Readonly<Record<string, string>> = {
    date: 'date',
    account: 'account',
    memo: 'memo',
}

// A line row's fields by the line input that shows each.
const LINE_FIELDS: Readonly<Record<string, string>> = {
    product: 'product',
    bin: 'bin',
    quantity: 'change',
    value: 'value',
}

const LINE_REFUSAL = /^Line (\d+):/

// The form's setError, typed by its use here so this module needs no form hook. Method
// syntax, so react-hook-form's setError (typed by the form's field paths) fits.
export type AdjustmentRefusalForm = {
    setError(name: string, error: { type: string; message: string }): void
}

export type AdjustmentRefusalPlace = {
    // The lines the save wrote, in position order (the parsed values' lines).
    saved: readonly { id: string }[]
    // The lines the form holds now (its field array), blank ones included.
    formLines: readonly { id: string }[]
    // The index in `saved` of the line whose own write was refused; absent for a write of
    // the header or of the status.
    lineAt?: number | null
}

// The form index of the saved line at `index`; null when the form no longer holds it.
function formIndexOf(index: number, place: AdjustmentRefusalPlace): number | null {
    const id = place.saved[index]?.id
    if (id === undefined) return null
    const at = place.formLines.findIndex(line => line.id === id)
    return at === -1 ? null : at
}

// The form path of a "Line n: …" text; null when the text numbers no line the form holds.
function lineTextField(message: string, place: AdjustmentRefusalPlace): string | null {
    const match = LINE_REFUSAL.exec(message)
    if (!match) return null
    const at = formIndexOf(Number(match[1]) - 1, place)
    return at === null ? null : `lines.${at}.root`
}

type PlacedRefusal = { field: string; message: string }

/**
 * Core's placement of a refusal over one write's fields: `fields` maps each server field
 * the write's inputs show to its form path. Core sets an error for each field it knows
 * (`getValues`' keys), and the root for the rest.
 */
function placedByCore(
    error: unknown,
    fields: Readonly<Record<string, string>>,
    prefix: string
): PlacedRefusal[] {
    const placed: PlacedRefusal[] = []
    const setError = (name: string, option: ErrorOption) => {
        const field = name === 'root' ? 'root' : `${prefix}${fields[name] ?? name}`
        placed.push({ field, message: option.message ?? '' })
    }
    handleMutationErrorsWithForm({ setError, getValues: () => fields, rootMessage: true })(error)
    return placed
}

/** A refusal's messages by the form path each shows under ('root' for the summary). */
export function adjustmentRefusals(error: unknown, place: AdjustmentRefusalPlace): PlacedRefusal[] {
    const message = messageOnlyRefusal(error)
    const lineText = message === null ? null : lineTextField(message, place)
    if (message !== null && lineText !== null) return [{ field: lineText, message }]
    const lineAt = place.lineAt == null ? null : formIndexOf(place.lineAt, place)
    if (lineAt === null) return placedByCore(error, HEADER_FIELDS, '')
    return placedByCore(error, LINE_FIELDS, `lines.${lineAt}.`)
}

/**
 * A refusal as the form's start errors (useForm `errors`): the draft's form that a new
 * adjustment's refused save handed off to shows it from its mount.
 */
export function adjustmentRefusalErrors(
    error: unknown,
    place: AdjustmentRefusalPlace
): FieldErrors<AdjustmentValues> {
    const errors: FieldErrors<AdjustmentValues> = {}
    for (const { field, message } of adjustmentRefusals(error, place)) {
        set(errors, field, { type: 'server', message })
    }
    return errors
}

/** The mutation's onError: each refusal on the form as a server error. */
export function adjustmentRefusalHandler(
    form: AdjustmentRefusalForm,
    place: AdjustmentRefusalPlace
): (error: unknown) => void {
    return error => {
        for (const { field, message } of adjustmentRefusals(error, place)) {
            form.setError(field, { type: 'server', message })
        }
    }
}
