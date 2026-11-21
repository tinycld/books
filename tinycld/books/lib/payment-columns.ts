// The payment grids' columns (spec §3.3): the header, every row and the totals row read
// these, so a column lines up from the header down. Every data column grows with the grid
// and never gets narrower than 95 px; the tick column is a fixed 44 px. Money columns are
// right-aligned. The document (Invoice / Bill) and Due date columns take two shares of the
// free width, so the link label and "· Overdue" fit at 1280 px.
const DATA_COLUMN = { flex: 1, minWidth: 95 } as const
const WIDE_DATA_COLUMN = { flex: 2, minWidth: 95 } as const

export type FlexColumn = { readonly flex: number; readonly minWidth: number }

export const PAYMENT_COLUMNS = {
    tick: 44,
    invoice: WIDE_DATA_COLUMN,
    dueDate: WIDE_DATA_COLUMN,
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
    bill: WIDE_DATA_COLUMN,
    dueDate: WIDE_DATA_COLUMN,
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

// The vendor credit's apply dialog (vendor credit spec §3.9): Tick, Bill (with the vendor's
// bill no. under it), Due date, Open balance, Credit to apply. No Vendor column (the bills
// are the credit's vendor's) and no Bill total column; every data column takes one share.
export const CREDIT_APPLY_COLUMNS = {
    tick: 44,
    bill: DATA_COLUMN,
    dueDate: DATA_COLUMN,
    open: DATA_COLUMN,
    payment: DATA_COLUMN,
} as const

export const CREDIT_APPLY_GRID_MIN_WIDTH = gridMinWidth(
    [CREDIT_APPLY_COLUMNS.tick],
    [
        CREDIT_APPLY_COLUMNS.bill,
        CREDIT_APPLY_COLUMNS.dueDate,
        CREDIT_APPLY_COLUMNS.open,
        CREDIT_APPLY_COLUMNS.payment,
    ]
)

// The credit memo's apply dialog (apply credit spec §3.2): Tick, Invoice, Due date, Open
// balance, Credit to apply. The one column set whose least widths pass the spec's 95 px:
// Due date takes 154 px, so "Oct 14, 2026 · Overdue" is not cut, and Credit to apply 114 px.
// The grid's least width (566 px) still fits the xl dialog's 598 px of content.
export const MEMO_APPLY_COLUMNS = {
    tick: 44,
    invoice: DATA_COLUMN,
    dueDate: { flex: 1, minWidth: 154 },
    open: DATA_COLUMN,
    payment: { flex: 1, minWidth: 114 },
} as const

export const MEMO_APPLY_GRID_MIN_WIDTH = gridMinWidth(
    [MEMO_APPLY_COLUMNS.tick],
    [
        MEMO_APPLY_COLUMNS.invoice,
        MEMO_APPLY_COLUMNS.dueDate,
        MEMO_APPLY_COLUMNS.open,
        MEMO_APPLY_COLUMNS.payment,
    ]
)

// The vendor refund's credits (vendor refund spec §3.4): Tick, Vendor credit (with the
// vendor's credit no. under it), Credit date, Credit total, Unapplied credit, Refund. No
// Vendor column (the credits are one vendor's); the Vendor credit column takes two shares,
// so its link label fits.
export const REFUND_COLUMNS = {
    tick: 44,
    credit: WIDE_DATA_COLUMN,
    creditDate: DATA_COLUMN,
    total: DATA_COLUMN,
    open: DATA_COLUMN,
    refund: DATA_COLUMN,
} as const

export const REFUND_GRID_MIN_WIDTH = gridMinWidth(
    [REFUND_COLUMNS.tick],
    [
        REFUND_COLUMNS.credit,
        REFUND_COLUMNS.creditDate,
        REFUND_COLUMNS.total,
        REFUND_COLUMNS.open,
        REFUND_COLUMNS.refund,
    ]
)

// The vendor refund read view's refunded credits (vendor refund spec §3.7): Vendor credit,
// Credit date, Credit total, Refunded.
export const REFUND_APPLIED_MIN_WIDTH = gridMinWidth(
    [],
    [REFUND_COLUMNS.credit, REFUND_COLUMNS.creditDate, REFUND_COLUMNS.total, REFUND_COLUMNS.refund]
)

// The bill payment read view's Bills paid grid (pay-bills spec §3.8): Bill, Vendor's bill
// no., Due date, Bill total, Paid.
export const BILL_PAYMENT_APPLIED_COLUMNS = {
    bill: WIDE_DATA_COLUMN,
    ref: DATA_COLUMN,
    dueDate: WIDE_DATA_COLUMN,
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
