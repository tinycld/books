// The inventory adjustment form's values and its quantity arithmetic (inventory-adjust spec
// §3.3). The form keeps every line field as the text its input shows. New quantity and
// Change are linked (Change = New quantity − On hand, New quantity = On hand + Change),
// and every sum is done in hundredths, as the server does (server/stock.go `qtyHundredths`),
// so a decimal sum is exact (0.1 + 0.2 is 0.3). The adjustment stores Change only.

import { newRecordId } from 'pbtsdb/core'
import type { BooksInventoryAdjustmentLines, BooksInventoryAdjustments } from '../types'
import { moneyInputText } from './money-input'
import { centsToText, parseMoney } from './money-text'

export type AdjustmentLineValues = {
    // The line's row id: the stored row's id for a stored line, a new id for a line added
    // in the form. The save plans the lines by it (insert, update, delete), never by index.
    id: string
    product: string
    // The bin location id; '' is No bin.
    bin: string
    // The New quantity and Change inputs' texts: numbers with at most 2 decimals once valid.
    newQuantity: string
    change: string
    // The Value change input's text; integer cents once it parses.
    value: string
}

export type AdjustmentValues = {
    date: string
    account: string
    memo: string
    lines: AdjustmentLineValues[]
}

// The most lines one adjustment holds (server/inventory_adjustment_guards.go
// `maxAdjustmentLines`).
export const ADJUSTMENT_LINE_LIMIT = 500

// The most a line's quantity changes, either way (server/inventory_adjustment_guards.go
// `maxAdjustmentQuantity`), in hundredths.
export const ADJUSTMENT_QUANTITY_LIMIT = 1_000_000 * 100

/** "Add line" (and ⌥↵) adds a line while the adjustment holds fewer than the limit. */
export function canAddAdjustmentLine(lineCount: number): boolean {
    return lineCount < ADJUSTMENT_LINE_LIMIT
}

function hundredths(quantity: number): number {
    return Math.round(quantity * 100)
}

function fromHundredths(value: number): number {
    // `+ 0` turns -0 into 0, so a quantity never prints as "-0".
    return value / 100 + 0
}

/** Change = New quantity − On hand, exact in hundredths. */
export function changeFromNew(onHand: number, next: number): number {
    return fromHundredths(hundredths(next) - hundredths(onHand))
}

/** New quantity = On hand + Change, exact in hundredths. */
export function newFromChange(onHand: number, change: number): number {
    return fromHundredths(hundredths(onHand) + hundredths(change))
}

/**
 * What the Value change means for a Change: the cost of the added quantity (`cost`), the
 * costing method's cost of a decrease, which the form does not take (`at-cost`), or the
 * change of the value of the stock on hand (`revalue`).
 */
export function valueMode(change: number): 'cost' | 'at-cost' | 'revalue' {
    if (change > 0) return 'cost'
    if (change < 0) return 'at-cost'
    return 'revalue'
}

/** The Change takes the quantity below zero (the hint under New quantity; not a refusal). */
export function goesBelowZero(onHand: number, change: number): boolean {
    return hundredths(onHand) + hundredths(change) < 0
}

/** A quantity as its input shows it: at most 2 decimals, no trailing zeros ("12", "0.15"). */
export function quantityText(quantity: number): string {
    return String(fromHundredths(hundredths(quantity)))
}

// A plain decimal, with an optional sign (the ASCII minus or U+2212, which the read view
// prints) and optional thousands commas.
const QUANTITY_PATTERN = /^([-−]?)((?:[1-9]\d{0,2}(?:,\d{3})+)|\d*)(?:\.(\d*))?$/

/**
 * The number a quantity text holds, with the count of its decimals: an empty text is 0;
 * null for a text that is not a number.
 */
export function quantityOfText(text: string): { quantity: number; decimals: number } | null {
    const trimmed = text.trim()
    if (trimmed === '') return { quantity: 0, decimals: 0 }
    const match = QUANTITY_PATTERN.exec(trimmed)
    if (!match) return null
    const [, sign, whole = '', fraction = ''] = match
    if (whole === '' && fraction === '') return null
    const magnitude = Number(`${whole.replace(/,/g, '') || '0'}.${fraction || '0'}`)
    return {
        quantity: sign === '' || magnitude === 0 ? magnitude : -magnitude,
        decimals: fraction.length,
    }
}

/** The cents of a Value change text: 0 for an empty text, null for text that is not money. */
export function valueCentsOfText(text: string): number | null {
    if (text.trim() === '') return 0
    return parseMoney(text)
}

/** A line "Add line" (⌥↵, Enter in the last line) adds: a new row id and empty fields. */
export function emptyAdjustmentLine(): AdjustmentLineValues {
    return { id: newRecordId(), product: '', bin: '', newQuantity: '', change: '', value: '' }
}

/**
 * The lines the save writes: a line with no item, no Change and no Value change is left
 * out (a new form's unused starting line), any one of them keeps it.
 */
export function dropBlankLines<L extends AdjustmentLineValues>(lines: readonly L[]): L[] {
    return lines.filter(
        line => line.product !== '' || line.change.trim() !== '' || line.value.trim() !== ''
    )
}

type StoredLine = Pick<
    BooksInventoryAdjustmentLines,
    'id' | 'product' | 'bin' | 'quantity' | 'value' | 'value_given' | 'position'
>

/**
 * The Value change text a stored line reopens with: a typed value as typed, 0 too ("0.00",
 * so an increase at a typed 0 stays free stock); a value nobody typed (`value_given`
 * false) shows empty when it is 0, which on an increase means the last cost.
 */
function storedValueText(line: StoredLine): string {
    if (line.value_given && line.value === 0) return centsToText(0)
    return moneyInputText(line.value)
}

/** The `value_given` a line sends: its Value change text is not empty and the value counts. */
export function isValueGiven(
    line: Pick<AdjustmentLineValues, 'value'>,
    isAtCost: boolean
): boolean {
    return !isAtCost && line.value.trim() !== ''
}

/** The quantity of an item in a bin ('' is No bin) now, and the item's total on hand. */
export type OnHandOf = (product: string, bin: string) => { quantity: number; total: number }

/**
 * A stored draft's values, its lines in position order. New quantity is the On hand now
 * plus the stored Change (spec §3.3), not the On hand when the draft was saved. The Value
 * change is `storedValueText`: a typed 0 shows "0.00", a value nobody typed shows empty.
 */
export function adjustmentValuesFrom(
    record: Pick<BooksInventoryAdjustments, 'date' | 'account' | 'memo'>,
    lines: readonly StoredLine[],
    onHandOf: OnHandOf
): AdjustmentValues {
    const ordered = [...lines].sort((a, b) => a.position - b.position)
    return {
        date: record.date.slice(0, 10),
        account: record.account,
        memo: record.memo,
        lines: ordered.map(line => ({
            id: line.id,
            product: line.product,
            bin: line.bin,
            newQuantity: quantityText(
                newFromChange(onHandOf(line.product, line.bin).quantity, line.quantity)
            ),
            change: quantityText(line.quantity),
            value: storedValueText(line),
        })),
    }
}

// `copy`: `?copy=<id>`; `replaces`: `?replaces=<id>`, the correction of a posted adjustment.
export type AdjustmentStartMode = 'copy' | 'replaces'

/**
 * A new adjustment's values started from another one (spec §3.2): a copy takes the account,
 * the memo and the lines (item, bin, change, value change) with `today` as its date; a
 * correction keeps the date too. New quantity is the On hand now plus the stored Change, as
 * `adjustmentValuesFrom`. Both are new adjustments (§4 "A correction inserts with
 * `replaces`"), so each line takes a new row id and the save inserts every line.
 */
export function adjustmentStartValues(
    mode: AdjustmentStartMode,
    record: Pick<BooksInventoryAdjustments, 'date' | 'account' | 'memo'>,
    lines: readonly StoredLine[],
    onHandOf: OnHandOf,
    today: string
): AdjustmentValues {
    const stored = adjustmentValuesFrom(record, lines, onHandOf)
    return {
        ...stored,
        date: mode === 'copy' ? today : stored.date,
        lines: stored.lines.map(line => ({ ...line, id: newRecordId() })),
    }
}
