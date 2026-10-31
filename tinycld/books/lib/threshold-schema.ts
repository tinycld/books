import { z } from '@tinycld/core/ui/form'
import type { BooksSettings } from '../types'
import { isWellFormedMoney, parseMoney } from './money'
import { centsToText } from './opening-balances'

export const THRESHOLD_MESSAGES = {
    malformed: 'Enter an amount, like 2,000.00',
    negative: 'The threshold cannot be negative',
    tooLarge: 'Use a smaller amount',
} as const

export type ThresholdValues = { threshold_1099: string }

// The output is the canonical text, not cents, so the settings form's reset after a save
// shows the saved value as Books prints it; thresholdCents turns it into cents for the write.
function thresholdText(text: string, currency: string, ctx: z.RefinementCtx): string {
    const trimmed = text.trim()
    const cents = parseMoney(trimmed, currency)
    if (cents !== null) {
        if (cents < 0) return refuse(ctx, THRESHOLD_MESSAGES.negative)
        return centsToText(cents)
    }
    // parseMoney also answers null for a well-formed amount over the stored maximum.
    if (isWellFormedMoney(trimmed, currency)) {
        const message = trimmed.startsWith('-')
            ? THRESHOLD_MESSAGES.negative
            : THRESHOLD_MESSAGES.tooLarge
        return refuse(ctx, message)
    }
    return refuse(ctx, THRESHOLD_MESSAGES.malformed)
}

function refuse(ctx: z.RefinementCtx, message: string): never {
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
}

export function thresholdSchema(currency: string) {
    return z.object({
        threshold_1099: z.string().transform((text, ctx) => thresholdText(text, currency, ctx)),
    })
}

export function thresholdValues(settings: Pick<BooksSettings, 'threshold_1099'>): ThresholdValues {
    return { threshold_1099: centsToText(settings.threshold_1099) }
}

export function thresholdCents(text: string, currency: string): number {
    const cents = parseMoney(text, currency)
    if (cents === null || cents < 0) throw new Error(`Not a threshold amount: ${text}`)
    return cents
}
