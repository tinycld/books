// The outstanding grid's column widths (spec §3.3): the header and every row read these,
// so a column lines up from the header down. Money columns are right-aligned.
export const PAYMENT_COLUMNS = {
    tick: 44,
    invoice: { flex: 1, minWidth: 200 },
    dueDate: 172,
    original: 128,
    open: 128,
    payment: 160,
} as const

// The gap between two cells of a row (`gap-3`) and a row's padding on each side (`px-2`),
// as the grids draw them.
export const PAYMENT_CELL_GAP = 12
export const PAYMENT_ROW_PADDING = 8

// A grid's narrowest width: its columns, the gaps between them and the row's padding.
// Below it the grid scrolls sideways (useTableMinWidth).
function gridMinWidth(columns: readonly number[]): number {
    const cells = columns.reduce((sum, width) => sum + width, 0)
    return cells + (columns.length - 1) * PAYMENT_CELL_GAP + 2 * PAYMENT_ROW_PADDING
}

// The outstanding grid: Tick, Invoice, Due date, Original amount, Open balance, Payment.
export const PAYMENT_GRID_MIN_WIDTH = gridMinWidth([
    PAYMENT_COLUMNS.tick,
    PAYMENT_COLUMNS.invoice.minWidth,
    PAYMENT_COLUMNS.dueDate,
    PAYMENT_COLUMNS.original,
    PAYMENT_COLUMNS.open,
    PAYMENT_COLUMNS.payment,
])

// The read view's applied grid: Invoice, Due date, Original amount, Applied (the Payment
// column's width).
export const PAYMENT_APPLIED_MIN_WIDTH = gridMinWidth([
    PAYMENT_COLUMNS.invoice.minWidth,
    PAYMENT_COLUMNS.dueDate,
    PAYMENT_COLUMNS.original,
    PAYMENT_COLUMNS.payment,
])

// The outstanding list and the read view's applied list are cards when the form's own
// width is above 0 and below this.
export const PAYMENT_CARDS_BELOW = 640
