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

// A new order's Ship to (spec §3.3, Q8): the business name and each line of the address of
// Settings → Company, one per line, with empty lines dropped. Kept within SHIP_TO_SCHEMA's
// bounds, so the start value never blocks a save: at most SHIP_TO_MAX_LINES lines, cut at
// SHIP_TO_MAX_LENGTH characters.
export function shipToStartOf(settings: { business_name: string; address: string }): string {
    const lines = [settings.business_name, ...settings.address.split(/\r\n|\r|\n/)]
        .map(line => line.trim())
        .filter(line => line !== '')
    return lines.slice(0, SHIP_TO_MAX_LINES).join('\n').slice(0, SHIP_TO_MAX_LENGTH)
}

export const SHIP_TO_SCHEMA = z
    .string()
    .max(SHIP_TO_MAX_LENGTH, SHIP_TO_MESSAGES.tooLong)
    .refine(text => lineCount(text) <= SHIP_TO_MAX_LINES, SHIP_TO_MESSAGES.tooManyLines)
    .nullish()
