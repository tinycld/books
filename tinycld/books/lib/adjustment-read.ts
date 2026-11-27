import type { BooksInventoryAdjustments } from '../types'
import { DELETED_ITEM_TEXT, READ_DASH } from './adjustment-list'
import { itemAmountText } from './deposit'
import { INVENTORY_TEXTS, NO_BIN_LABEL } from './inventory-adjust-fixture'
import { MINUS } from './money'
import { productPath } from './product-route'
import type { RecordRoute } from './record-route'
import { stockSourcePath, stockSourceWord } from './stock-move-link'

// The inventory adjustment's read view (inventory-adjust spec §3.5): the value Books posted
// for each line, the total, the notice of an adjustment Books made, the actions, the
// journal entry text, the bin label and the read lines' columns. No cost is computed here:
// every value is one the server stored.

type Adjustment = Pick<BooksInventoryAdjustments, 'kind' | 'status' | 'source' | 'document'>
type AdjustmentStatus = BooksInventoryAdjustments['status']

// Total value change: the adjustment's `value_change`, which the server writes at the post
// (a re-cost has no move of its own, so a sum of the rows would miss its drift).
export function adjustmentReadTotal(adjustment: Pick<BooksInventoryAdjustments, 'value_change'>) {
    return adjustment.value_change
}

/**
 * The Total value change text: the value at the post of a posted or void adjustment; "—"
 * for a draft, which Books has posted nothing for.
 */
export function adjustmentReadTotalText(
    adjustment: Pick<BooksInventoryAdjustments, 'status' | 'value_change' | 'currency'>
): string {
    if (adjustment.status === 'draft') return READ_DASH
    return itemAmountText(adjustmentReadTotal(adjustment), adjustment.currency)
}

export type BooksMadeNotice = { text: string; target: RecordRoute | string | null }

/**
 * The notice of an adjustment Books made, with the target of its link: the item of an
 * opening adjustment, the document of a re-cost (`documentNumber` is that document's
 * number, read by the caller); null for a manual adjustment.
 */
export function booksMadeNotice(
    adjustment: Adjustment,
    names: { itemName: string; documentNumber: string }
): BooksMadeNotice | null {
    if (adjustment.kind === 'opening') {
        return {
            text: `Books made this adjustment for the opening stock of ${names.itemName}. To change it, change the item’s opening stock.`,
            target: productPath(adjustment.document),
        }
    }
    if (adjustment.kind === 'recost') {
        const document = [stockSourceWord(adjustment.source), names.documentNumber]
            .filter(Boolean)
            .join(' ')
        return {
            text: `Books made this adjustment when the cost of ${document} changed.`,
            target: stockSourcePath(adjustment.source, adjustment.document),
        }
    }
    return null
}

export type AdjustmentReadAction = 'edit' | 'void' | 'copy'

/**
 * The read view's actions for a writer: Edit, Void and Copy on a posted manual adjustment,
 * Edit and Copy on a draft, Copy on a void one; none on an adjustment Books made, and none
 * for a reader.
 */
export function adjustmentReadActions(
    adjustment: Pick<BooksInventoryAdjustments, 'kind' | 'status'>,
    canWrite: boolean
): AdjustmentReadAction[] {
    if (!canWrite || adjustment.kind !== 'manual') return []
    if (adjustment.status === 'posted') return ['edit', 'void', 'copy']
    if (adjustment.status === 'draft') return ['edit', 'copy']
    return ['copy']
}

// The text in place of "View journal entry": a posted or void adjustment with no entry
// changed no value. A draft has no entry yet and says nothing.
export function noEntryText(
    adjustment: Pick<BooksInventoryAdjustments, 'status' | 'entry'>
): string | null {
    if (adjustment.status === 'draft' || adjustment.entry !== '') return null
    return INVENTORY_TEXTS.noEntry
}

// "No bin" for a line in no bin, the bin's name, and " (inactive)" after an inactive one.
export function binLabel(bin: { name: string; inactive: boolean } | undefined): string {
    if (!bin) return NO_BIN_LABEL
    return bin.inactive ? `${bin.name} (inactive)` : bin.name
}

// The Change cell: "+2", "−4" (U+2212), at most 2 decimals; "—" for a line that changes
// only the value.
export function quantityChangeText(quantity: number): string {
    if (quantity === 0) return READ_DASH
    const text = String(Math.round(Math.abs(quantity) * 100) / 100)
    return quantity > 0 ? `+${text}` : `${MINUS}${text}`
}

// The Bin cell: "—" for a line that changes only the value (it moves no stock in a bin).
export function lineBinText(
    quantity: number,
    bin: { name: string; inactive: boolean } | undefined
): string {
    if (quantity === 0) return READ_DASH
    return binLabel(bin)
}

// The Value change cell: the line's `posted_value`, which the server writes at the post
// (server/inventory_adjustments.go writeLinePostedValues) and a void keeps. A draft shows
// "—": Books has posted nothing for it.
export function lineValueText(status: AdjustmentStatus, postedValue: number, currency: string) {
    if (status === 'draft') return READ_DASH
    return itemAmountText(postedValue, currency)
}

// A read line as the read view reads it: its item's name (undefined when the item row is
// gone), its bin row and the value Books posted for it.
type ReadLine = {
    id: string
    productName: string | undefined
    quantity: number
    binRow: { name: string; inactive: boolean } | undefined
    posted_value: number
}

// A read line with each cell's text.
export type ReadLineCells = Record<AdjustmentReadColumnKey, string> & { id: string }

/** The cells of each line: "Deleted item" for a line whose item row is gone. */
export function readLineCells(
    lines: readonly ReadLine[],
    status: AdjustmentStatus,
    currency: string
): ReadLineCells[] {
    return lines.map(line => ({
        id: line.id,
        item: line.productName ?? DELETED_ITEM_TEXT,
        bin: lineBinText(line.quantity, line.binRow),
        change: quantityChangeText(line.quantity),
        value: lineValueText(status, line.posted_value, currency),
    }))
}

export type AdjustmentReadColumnKey = 'item' | 'bin' | 'change' | 'value'

export type AdjustmentReadColumn = {
    key: AdjustmentReadColumnKey
    label: string
    minWidth: number
    align: 'left' | 'right'
}

const READ_COLUMNS: readonly AdjustmentReadColumn[] = [
    { key: 'item', label: 'Item', minWidth: 180, align: 'left' },
    { key: 'bin', label: 'Bin', minWidth: 120, align: 'left' },
    { key: 'change', label: 'Change', minWidth: 96, align: 'right' },
    { key: 'value', label: 'Value change', minWidth: 120, align: 'right' },
]

// Three gaps of 8 px and 48 px of padding. Without the Bin column only its 120 px go
// (the spec's 588 − 120 = 468), so the table keeps a spare gap of room.
const READ_GAPS_AND_PADDING = 3 * 8 + 48

// Item, Bin, Change, Value change; no Bin while the book has no bin (spec §3.1).
export function adjustmentReadColumns(hasBins: boolean): readonly AdjustmentReadColumn[] {
    if (hasBins) return READ_COLUMNS
    return READ_COLUMNS.filter(column => column.key !== 'bin')
}

// The read lines' table minimum: 588 px, 468 with no Bin column; cards below it.
export function adjustmentReadMinWidth(hasBins: boolean): number {
    const columns = adjustmentReadColumns(hasBins)
    return columns.reduce((sum, column) => sum + column.minWidth, 0) + READ_GAPS_AND_PADDING
}
