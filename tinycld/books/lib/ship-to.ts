import { z } from '@tinycld/core/ui/form'

// A purchase order's Ship to (purchase order spec §3.3): free text of at most 500
// characters, the bound of books_purchase_orders.ship_to (2100000048), and at most 5
// lines. The forms engine runs SHIP_TO_SCHEMA for the ShipToField built-in
// (forms/ui.ts `schemas`), so a refused value blocks the save and shows under the cell.
export const SHIP_TO_MAX_LENGTH = 500
export const SHIP_TO_MAX_LINES = 5

export const SHIP_TO_MESSAGES = {
    tooLong: `Ship to can be at most ${SHIP_TO_MAX_LENGTH} characters`,
    tooManyLines: `Ship to can be at most ${SHIP_TO_MAX_LINES} lines`,
} as const

// \r\n, \r and \n each end one line.
function lineCount(text: string): number {
    return text.split(/\r\n|\r|\n/).length
}

export const SHIP_TO_SCHEMA = z
    .string()
    .max(SHIP_TO_MAX_LENGTH, SHIP_TO_MESSAGES.tooLong)
    .refine(text => lineCount(text) <= SHIP_TO_MAX_LINES, SHIP_TO_MESSAGES.tooManyLines)
    .nullish()
