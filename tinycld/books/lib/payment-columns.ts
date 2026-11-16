// The payment grids' columns (spec §3.3): the header, every row and the totals row read
// these, so a column lines up from the header down. Every data column grows with the grid
// and never gets narrower than 95 px; the tick column is a fixed 44 px. Money columns are
// right-aligned.
const DATA_COLUMN = { flex: 1, minWidth: 95 } as const

export type FlexColumn = { readonly flex: number; readonly minWidth: number }

export const PAYMENT_COLUMNS = {
    tick: 44,
    invoice: DATA_COLUMN,
    dueDate: DATA_COLUMN,
    original: DATA_COLUMN,
    open: DATA_COLUMN,
    payment: DATA_COLUMN,
} as const

// The gap between two cells of a row (`gap-3`) and a row's padding on each side (`px-2`),
// as the grids draw them.
export const PAYMENT_CELL_GAP = 12
export const PAYMENT_ROW_PADDING = 8

// A grid's least width: its fixed columns, its data columns' least widths, the gaps between
// them and the row's padding. A list narrower than this shows cards, not the grid.
function gridMinWidth(fixed: readonly number[], data: readonly FlexColumn[]): number {
    const widths = [...fixed, ...data.map(column => column.minWidth)]
    const cells = widths.reduce((sum, width) => sum + width, 0)
    return cells + (widths.length - 1) * PAYMENT_CELL_GAP + 2 * PAYMENT_ROW_PADDING
}

// The outstanding grid: Tick, Invoice, Due date, Original amount, Open balance, Payment.
export const PAYMENT_GRID_MIN_WIDTH = gridMinWidth(
    [PAYMENT_COLUMNS.tick],
    [
        PAYMENT_COLUMNS.invoice,
        PAYMENT_COLUMNS.dueDate,
        PAYMENT_COLUMNS.original,
        PAYMENT_COLUMNS.open,
        PAYMENT_COLUMNS.payment,
    ]
)

// The read view's applied grid: Invoice, Due date, Original amount, Applied (the Payment
// column).
export const PAYMENT_APPLIED_MIN_WIDTH = gridMinWidth(
    [],
    [
        PAYMENT_COLUMNS.invoice,
        PAYMENT_COLUMNS.dueDate,
        PAYMENT_COLUMNS.original,
        PAYMENT_COLUMNS.payment,
    ]
)

// The Pay Bills grid (pay-bills spec §3.3): Tick, Vendor, Bill (with the vendor's bill no.
// under it), Due date, Bill total, Open balance, Payment.
export const BILL_PAYMENT_COLUMNS = {
    tick: 44,
    party: DATA_COLUMN,
    bill: DATA_COLUMN,
    dueDate: DATA_COLUMN,
    original: DATA_COLUMN,
    open: DATA_COLUMN,
    payment: DATA_COLUMN,
} as const

export const BILL_PAYMENT_GRID_MIN_WIDTH = gridMinWidth(
    [BILL_PAYMENT_COLUMNS.tick],
    [
        BILL_PAYMENT_COLUMNS.party,
        BILL_PAYMENT_COLUMNS.bill,
        BILL_PAYMENT_COLUMNS.dueDate,
        BILL_PAYMENT_COLUMNS.original,
        BILL_PAYMENT_COLUMNS.open,
        BILL_PAYMENT_COLUMNS.payment,
    ]
)

// The bill payment read view's Bills paid grid (pay-bills spec §3.8): Bill, Vendor's bill
// no., Due date, Bill total, Paid.
export const BILL_PAYMENT_APPLIED_COLUMNS = {
    bill: DATA_COLUMN,
    ref: DATA_COLUMN,
    dueDate: DATA_COLUMN,
    original: DATA_COLUMN,
    paid: DATA_COLUMN,
} as const

export const BILL_PAYMENT_APPLIED_MIN_WIDTH = gridMinWidth(
    [],
    [
        BILL_PAYMENT_APPLIED_COLUMNS.bill,
        BILL_PAYMENT_APPLIED_COLUMNS.ref,
        BILL_PAYMENT_APPLIED_COLUMNS.dueDate,
        BILL_PAYMENT_APPLIED_COLUMNS.original,
        BILL_PAYMENT_APPLIED_COLUMNS.paid,
    ]
)
