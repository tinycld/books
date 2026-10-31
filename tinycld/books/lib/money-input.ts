import { z } from '@tinycld/core/ui/form'
import { centsToText, isWellFormedMoney, maxStoredAmount, parseMoney } from './money'
import { MONEY_MALFORMED, MONEY_NEGATIVE, MONEY_TOO_LARGE } from './product-messages'

// The rules of the product form's money input (HostMoneyInput). The form value is
// integer cents; text that does not parse is sent as the text itself, so the save is
// blocked with the cell's message and never writes a value the input does not show.

/** The text an input shows for a stored value: nothing for 0 or a value that is not cents. */
export function moneyInputText(value: unknown): string {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value === 0) return ''
    return centsToText(value)
}

/** The cents of typed text: 0 for empty text, null for text that does not parse. */
export function moneyInputCents(text: string, currency: string): number | null {
    if (text.trim() === '') return 0
    return parseMoney(text, currency)
}

/** The value the input sends: the cents when the text parses, else the text itself. */
export function moneyFieldValue(text: string, currency: string): number | string {
    return moneyInputCents(text, currency) ?? text
}

/**
 * The `FormHostUi.schemas` entry of `MoneyField`. The engine applies it at save and
 * between saves (checkpoint 0), so a malformed, negative or too-large amount blocks
 * the save with this message as the cell's text. A string is text that did not parse
 * in the Books currency: too large when it is well-formed but above the stored maximum,
 * else malformed (an amount in another currency's form included).
 */
export const MONEY_VALUE_SCHEMA = z.union([z.number(), z.string()]).superRefine((value, ctx) => {
    const message = moneyValueMessage(value)
    if (message !== null) ctx.addIssue({ code: 'custom', message })
})

function moneyValueMessage(value: number | string): string | null {
    if (typeof value === 'string') {
        return isWellFormedMoney(value) && parseMoney(value) === null
            ? MONEY_TOO_LARGE
            : MONEY_MALFORMED
    }
    if (!Number.isInteger(value)) return MONEY_MALFORMED
    if (value < 0) return MONEY_NEGATIVE
    if (value > maxStoredAmount) return MONEY_TOO_LARGE
    return null
}

/**
 * The input's text. Typing sends a value whose echo comes back as `value`; while the
 * typed text still reads as that value it is kept, so typing is never reformatted
 * under the cursor. Text that did not parse is the value itself. Any other value (a
 * reset, a load) is shown formatted.
 */
export function moneyHostText(typed: string | null, value: unknown, currency: string): string {
    if (typeof value === 'string') return value
    if (typed !== null && moneyInputCents(typed, currency) === value) return typed
    return moneyInputText(value)
}
