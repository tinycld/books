import { z } from '@tinycld/core/ui/form'
import {
    QUANTITY_DECIMALS,
    QUANTITY_MALFORMED,
    QUANTITY_NEGATIVE,
    QUANTITY_TOO_LARGE,
} from './product-messages'

// The rules of the product form's quantity input (HostQuantityInput): the reorder point
// and the opening quantity of an Inventory item. The form value is a number with at most
// 2 decimals; text that does not parse is sent as the text itself, so the save is blocked
// with the cell's message and never writes a value the input does not show.

// The server's bound of a stored quantity (migration 2100000038, MAX_QUANTITY).
export const MAX_QUANTITY = 1000000

const QUANTITY_TEXT = /^-?(\d+\.?\d*|\.\d+)$/

const GROUPED_TEXT = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/

/** The text an input shows for a stored value: nothing for 0 or a value that is no number. */
export function quantityInputText(value: unknown): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return ''
    return String(value)
}

/**
 * The quantity of typed text: 0 for empty text, null for text that is not a plain
 * decimal number or beyond the float range. A comma is allowed only as a thousands
 * separator in groups of 3 digits ("1,250", "12,500.5"); any other comma ("1,25", "1,2,3")
 * makes the text not parse, so a decimal comma is never read as a different number.
 */
export function quantityInputNumber(text: string): number | null {
    const trimmed = text.trim()
    if (trimmed.includes(',') && !GROUPED_TEXT.test(trimmed)) return null
    const plain = trimmed.replace(/,/g, '')
    if (plain === '') return 0
    if (!QUANTITY_TEXT.test(plain)) return null
    const value = Number(plain)
    return Number.isFinite(value) ? value : null
}

/** The value the input sends: the number when the text parses, else the text itself. */
export function quantityFieldValue(text: string): number | string {
    return quantityInputNumber(text) ?? text
}

function quantityValueMessage(value: number | string): string | null {
    if (typeof value === 'string' || !Number.isFinite(value)) return QUANTITY_MALFORMED
    if (value < 0) return QUANTITY_NEGATIVE
    if (value > MAX_QUANTITY) return QUANTITY_TOO_LARGE
    // toFixed, not a multiplication: 0.07 * 100 is not 7 in binary floating point.
    if (Number(value.toFixed(2)) !== value) return QUANTITY_DECIMALS
    return null
}

/**
 * The `FormHostUi.schemas` entry of `QuantityField`. The engine applies it at save and
 * between saves, so a malformed, negative or too-large quantity, or one with more than
 * 2 decimals, blocks the save with this message as the cell's text.
 */
export const QUANTITY_VALUE_SCHEMA = z.union([z.number(), z.string()]).superRefine((value, ctx) => {
    const message = quantityValueMessage(value)
    if (message !== null) ctx.addIssue({ code: 'custom', message })
})

/**
 * The input's text. Typing sends a value whose echo comes back as `value`; while the
 * typed text still reads as that value it is kept ("1." on the way to "1.5"). Text that
 * did not parse is the value itself. Any other value (a reset, a load) is shown plain.
 */
export function quantityHostText(typed: string | null, value: unknown): string {
    if (typeof value === 'string') return value
    if (typed !== null && quantityInputNumber(typed) === value) return typed
    return quantityInputText(value)
}

/** Quantity on hand as text: 0 for none; an oversold item shows its minus sign. */
export function quantityOnHandText(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0'
}
