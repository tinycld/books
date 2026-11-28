// The inventory adjustment form's one zod schema, for Save draft and Post alike
// (inventory-adjust spec §3.3, Rules). The rules the server holds too keep its texts
// (server/inventory_adjustments.go, server/inventory_adjustment_guards.go).
//
// Blank lines (no item, no Change, no Value change: a new form's unused starting line)
// are skipped by the rules and dropped from the parsed values (`dropBlankLines`), so the
// save never writes them. The rules run on the lines as the form holds them, so a line's
// error path is its index in the form's field array. Keys: `date`, `memo`,
// `lines.<n>.<field>`; a line's own error is its root (`lines.<n>.root`, drawn on the
// line) and a form-level one the form's root (`root`, drawn in FormErrorSummary).

import { z } from '@tinycld/core/ui/form'
import {
    ADJUSTMENT_LINE_LIMIT,
    ADJUSTMENT_QUANTITY_LIMIT,
    type AdjustmentValues,
    dropBlankLines,
    quantityOfText,
    valueCentsOfText,
} from './adjustment-values'
import { INVENTORY_TEXTS } from './inventory-adjust-fixture'
import { MONEY_MALFORMED } from './product-messages'
import { isIsoDay } from './register-range'

// The server's texts (server/inventory_adjustment_guards.go msgAdjustmentLineProduct,
// msgAdjustmentLineDecimals, msgAdjustmentLineTooLarge, msgAdjustmentTooManyLines;
// server/inventory_adjustments.go msgAdjustmentIncreaseValue).
export const ADJUSTMENT_MESSAGES = {
    noItem: 'Choose an Inventory item.',
    decimals: 'Enter a quantity with at most 2 decimals.',
    outOfRange: 'Enter a quantity between -1,000,000 and 1,000,000.',
    increaseBelowZero: 'A quantity increase cannot have a value below 0.',
    tooManyLines: 'An inventory adjustment holds at most 500 lines.',
    // Client texts: the spec names none for these.
    quantityMalformed: 'Enter a quantity such as 12 or -3.5',
    dateInvalid: 'Enter a date that exists',
    memoTooLong: 'The memo is too long',
} as const

// The text max of books_inventory_adjustments.memo. The server counts text in code
// points (PocketBase text max), not UTF-16 units.
const MAX_MEMO = 4000

function codePoints(text: string): number {
    return [...text].length
}

// The Change's hundredths, or the message under its input.
function lineChange(text: string): { hundredths: number } | { message: string } {
    const parsed = quantityOfText(text)
    if (parsed === null) return { message: ADJUSTMENT_MESSAGES.quantityMalformed }
    if (Math.abs(parsed.quantity) * 100 > ADJUSTMENT_QUANTITY_LIMIT) {
        return { message: ADJUSTMENT_MESSAGES.outOfRange }
    }
    if (parsed.decimals > 2) return { message: ADJUSTMENT_MESSAGES.decimals }
    return { hundredths: Math.round(parsed.quantity * 100) }
}

const lineSchema = z.object({
    // The line's row id (lib/adjustment-values.ts): never typed, so it carries no rule.
    id: z.string(),
    product: z.string(),
    bin: z.string(),
    newQuantity: z.string(),
    change: z.string(),
    value: z.string(),
})

export const adjustmentSchema: z.ZodType<AdjustmentValues, AdjustmentValues> = z
    .object({
        date: z.string(),
        account: z.string(),
        memo: z.string(),
        lines: z.array(lineSchema),
    })
    .superRefine((values, ctx) => {
        const add = (path: (string | number)[], message: string) =>
            ctx.addIssue({ code: 'custom', path, message })

        if (!isIsoDay(values.date)) add(['date'], ADJUSTMENT_MESSAGES.dateInvalid)
        if (codePoints(values.memo) > MAX_MEMO) add(['memo'], ADJUSTMENT_MESSAGES.memoTooLong)

        const kept = new Set(dropBlankLines(values.lines))
        if (kept.size === 0) {
            add(['root'], INVENTORY_TEXTS.noLines)
            return
        }
        if (kept.size > ADJUSTMENT_LINE_LIMIT) add(['root'], ADJUSTMENT_MESSAGES.tooManyLines)

        values.lines.forEach((line, index) => {
            if (!kept.has(line)) return
            if (line.product === '') add(['lines', index, 'product'], ADJUSTMENT_MESSAGES.noItem)
            // A New quantity that is not a number leaves Change as it was (the linked
            // handler computes Change only from a number), so the save stops here.
            // More than 2 decimals is refused as under Change: the linked Change is rounded
            // to hundredths, so the save would not write the quantity typed.
            const newQuantity = quantityOfText(line.newQuantity)
            if (newQuantity === null) {
                add(['lines', index, 'newQuantity'], ADJUSTMENT_MESSAGES.quantityMalformed)
            } else if (newQuantity.decimals > 2) {
                add(['lines', index, 'newQuantity'], ADJUSTMENT_MESSAGES.decimals)
            }
            const change = lineChange(line.change)
            if ('message' in change) add(['lines', index, 'change'], change.message)
            const cents = valueCentsOfText(line.value)
            if (cents === null) add(['lines', index, 'value'], MONEY_MALFORMED)
            if ('message' in change || cents === null) return
            if (change.hundredths === 0 && cents === 0) {
                add(['lines', index, 'root'], INVENTORY_TEXTS.lineEmpty)
            } else if (change.hundredths > 0 && cents < 0) {
                add(['lines', index, 'value'], ADJUSTMENT_MESSAGES.increaseBelowZero)
            }
        })
    })
    .transform(values => ({ ...values, lines: dropBlankLines(values.lines) }))
