import { z } from '@tinycld/core/ui/form'
import { binMessage } from './bin-messages'
import { ITEM_QUANTITY } from './product-messages'
import { MAX_QUANTITY } from './quantity-input'
import { quantityText } from './stock-display'

// The Move stock dialog's one schema (inventory-adjust spec §3.8). The rules are the
// server's transfer guard (validateBinTransfer, server/bins.go), with its texts
// (lib/bin-messages.ts): From and To differ; Quantity is above 0, at most MAX_QUANTITY,
// with at most 2 decimals; the From bin holds the quantity; Memo is at most 200
// characters (books_bin_transfers, migration 2100000049). '' is No bin on either side; a
// null To is no choice yet (the dialog starts so when From is No bin, and clears To when
// From becomes the To bin), which the client refuses before the server sees it.

export const MOVE_STOCK_TEXTS = {
    memoTooLong: 'A memo has at most 200 characters.',
    toRequired: 'Choose the bin location to move to.',
} as const

export const MOVE_MEMO_MAX = 200

function isMovableQuantity(quantity: number): boolean {
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return false
    // toFixed, not a multiplication: 0.07 * 100 is not 7 in binary floating point.
    return Number(quantity.toFixed(2)) === quantity
}

function hundredths(quantity: number): number {
    return Math.round(quantity * 100)
}

/**
 * `held(bin)` is the quantity of the item that a bin holds, and `nameOf(bin)` the name the
 * texts give it ("No bin" for '').
 */
export function moveStockSchema(held: (bin: string) => number, nameOf: (bin: string) => string) {
    return z
        .object({
            from: z.string(),
            to: z.string().nullable(),
            // An empty input or a partial number ("1.") is not a number yet: the same words.
            quantity: z.number({ error: ITEM_QUANTITY }).refine(isMovableQuantity, ITEM_QUANTITY),
            memo: z.string().trim().max(MOVE_MEMO_MAX, MOVE_STOCK_TEXTS.memoTooLong),
        })
        .superRefine((values, ctx) => {
            if (values.to === null) {
                ctx.addIssue({ code: 'custom', path: ['to'], message: MOVE_STOCK_TEXTS.toRequired })
            } else if (values.from === values.to) {
                ctx.addIssue({ code: 'custom', path: ['to'], message: binMessage('sameBins') })
                return
            }
            const inFrom = held(values.from)
            // A bin may go below zero (spec §8): one that holds 0 or less has nothing to move.
            if (inFrom <= 0) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['quantity'],
                    message: binMessage('holdsNone', nameOf(values.from)),
                })
                return
            }
            if (hundredths(values.quantity) > hundredths(inFrom)) {
                const text = quantityText(inFrom)
                ctx.addIssue({
                    code: 'custom',
                    path: ['quantity'],
                    message: binMessage('holds', nameOf(values.from), text, text),
                })
            }
        })
}

export type MoveStockValues = z.infer<ReturnType<typeof moveStockSchema>>
