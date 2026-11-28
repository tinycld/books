// The adjustment form's line grid columns (inventory-adjust spec §3.3): the header and
// every row read these, so a column lines up from the header down. Each data column grows
// with the grid above its minimum; the row menu is a fixed 44 px. Below the grid's own
// minimum (`adjustmentLinesMinWidth`) each line is a card.

import { type CellWidth, tableMinWidth } from './table-fit'

export type AdjustmentLineColumnKey =
    | 'item'
    | 'bin'
    | 'onHand'
    | 'newQuantity'
    | 'change'
    | 'value'
    | 'menu'

export type AdjustmentLineColumn = {
    key: AdjustmentLineColumnKey
    // The header text; '' for the row menu.
    label: string
    align: 'left' | 'right'
    // The cell's style: its minimum plus a share of the spare width, or a fixed width.
    cell: FlexCell | { width: number }
}

type FlexCell = { flexGrow: number; flexShrink: 0; flexBasis: number; minWidth: number }

// A column starts at its minimum and takes `grow` shares of the spare width. Item takes the
// most and Bin the next (their names are cut first); the figures fit at their minimum.
function flexCell(minWidth: number, grow: number): FlexCell {
    return { flexGrow: grow, flexShrink: 0, flexBasis: minWidth, minWidth }
}

const LINE_COLUMNS: readonly AdjustmentLineColumn[] = [
    { key: 'item', label: 'Item', align: 'left', cell: flexCell(180, 3) },
    { key: 'bin', label: 'Bin', align: 'left', cell: flexCell(120, 1) },
    { key: 'onHand', label: 'On hand', align: 'right', cell: flexCell(80, 0.2) },
    { key: 'newQuantity', label: 'New quantity', align: 'right', cell: flexCell(96, 0.2) },
    { key: 'change', label: 'Change', align: 'right', cell: flexCell(96, 0.2) },
    { key: 'value', label: 'Value change', align: 'right', cell: flexCell(120, 0.2) },
    { key: 'menu', label: '', align: 'right', cell: { width: 44 } },
]

// The gap between two cells of a row (`gap-2`) and a row's padding, both sides together
// (the lines frame's `p-4` and the row's `px-2`).
export const ADJUSTMENT_CELL_GAP = 8
export const ADJUSTMENT_ROW_PADDING = 48
// The lines frame's border (`border`, both sides together): the frame's measured width
// holds it, so the grid shows only while the frame is the minimum plus this wide.
export const ADJUSTMENT_FRAME_BORDER = 2

// A card's New quantity and Change sit side by side, each at least this wide.
export const ADJUSTMENT_CARD_HALF_MIN = 140

/** Item, Bin, On hand, New quantity, Change, Value change, menu; no Bin while the book has no bin. */
export function adjustmentLineColumns(hasBins: boolean): readonly AdjustmentLineColumn[] {
    if (hasBins) return LINE_COLUMNS
    return LINE_COLUMNS.filter(column => column.key !== 'bin')
}

/** The grid's minimum: 832 px, 704 with no Bin column (its 120 px and one gap). */
export function adjustmentLinesMinWidth(hasBins: boolean): number {
    const cells: CellWidth[] = adjustmentLineColumns(hasBins).map(column => column.cell)
    return tableMinWidth({ cells, gap: ADJUSTMENT_CELL_GAP, padding: ADJUSTMENT_ROW_PADDING })
}
