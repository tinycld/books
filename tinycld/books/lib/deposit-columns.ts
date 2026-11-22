// The deposit grids' columns (bank deposit spec §3.4, §3.5, §3.8): the header and every
// row read these, so a column lines up from the header down. Every data column grows with
// the grid and never gets narrower than 95 px; the tick and remove columns are a fixed
// 44 px. An Amount cell wraps and is never cut.
const COLUMN_MIN = 95
const FIXED_COLUMN = 44

// The gap between two cells of a row (`gap-3`) and a row's padding on each side (`px-2`),
// as the grids draw them.
export const DEPOSIT_CELL_GAP = 12
export const DEPOSIT_ROW_PADDING = 8
// From an item card's right edge to its amount's: the card's padding (`p-3`) and border.
export const DEPOSIT_CARD_INSET = 12 + 1

type Column = { readonly width: number } | { readonly flex: number; readonly minWidth: number }

// The undeposited items grid (form) and the items deposited grid (read view): Tick,
// Received from, Transaction, Date, Payment, Amount.
export const DEPOSIT_ITEM_COLUMNS = {
    tick: { width: FIXED_COLUMN },
    party: { flex: 2, minWidth: COLUMN_MIN },
    transaction: { flex: 2, minWidth: COLUMN_MIN },
    date: { flex: 1.2, minWidth: COLUMN_MIN },
    payment: { flex: 1.6, minWidth: COLUMN_MIN },
    amount: { flex: 1.6, minWidth: COLUMN_MIN },
} as const

// The other funds table: Received from, Account, Description, Amount, Remove. The read view
// draws no Remove column.
export const DEPOSIT_LINE_COLUMNS = {
    party: { flex: 2, minWidth: COLUMN_MIN },
    account: { flex: 2, minWidth: COLUMN_MIN },
    description: { flex: 2, minWidth: COLUMN_MIN },
    amount: { flex: 1.6, minWidth: COLUMN_MIN },
    remove: { width: FIXED_COLUMN },
} as const

function leastOf(column: Column): number {
    return 'width' in column ? column.width : column.minWidth
}

// A grid's least width: its columns' least widths, the gaps between them and the row's
// padding. A section narrower than this shows cards, not the grid.
function gridMinWidth(columns: readonly Column[]): number {
    const cells = columns.reduce((sum, column) => sum + leastOf(column), 0)
    return cells + (columns.length - 1) * DEPOSIT_CELL_GAP + 2 * DEPOSIT_ROW_PADDING
}

const { remove: _remove, ...READ_LINE_COLUMNS } = DEPOSIT_LINE_COLUMNS

// 595: tick 44, 5 × 95, 5 gaps, the padding.
export const depositItemsMinWidth = gridMinWidth(Object.values(DEPOSIT_ITEM_COLUMNS))
// 488: 4 × 95, remove 44, 4 gaps, the padding.
export const depositLinesMinWidth = gridMinWidth(Object.values(DEPOSIT_LINE_COLUMNS))
// 432: the read view's lines table, 4 × 95, 3 gaps, the padding.
export const depositReadLinesMinWidth = gridMinWidth(Object.values(READ_LINE_COLUMNS))
