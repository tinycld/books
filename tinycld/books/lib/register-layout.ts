import { tableMinWidth } from './table-fit'

// The account register's cells, shared by its heading row and its rows. Type, Memo and Account
// shrink to their minimums; the Status, amount and balance cells never shrink, so a word or a
// figure is never cut.
// Below the table's minimum width the register draws cards, never a sideways scroller.
// A fixed cell has no minimum of its own: its width is its minimum (`tableMinWidth`).
type FixedCell = { width: number; flexShrink: number; minWidth?: number }

export const DATE_CELL_STYLE: FixedCell = { width: 100, flexShrink: 0 }
export const REF_CELL_STYLE: FixedCell = { width: 80, flexShrink: 0 }
export const TYPE_CELL_STYLE = { width: 150, flexShrink: 1, minWidth: 72 }
export const MEMO_CELL_STYLE = { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 88 }
export const ACCOUNT_CELL_STYLE = { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 72 }
// The Status word ("Reconciled", "Cleared", "Matched"; reconcile spec §3 "The account register").
export const STATUS_CELL_STYLE: FixedCell = { width: 96, flexShrink: 0 }
export const AMOUNT_CELL_STYLE: FixedCell = { width: 104, flexShrink: 0 }
export const BALANCE_CELL_STYLE: FixedCell = { width: 116, flexShrink: 0 }

// The gap and the padding of `ROW_CLASS` (`gap-2`, `px-4` on both sides) in
// `components/register/RegisterRow.tsx`: a change of that class changes the minimum width.
export const REGISTER_ROW_GAP = 8
export const REGISTER_ROW_PADDING = 32

export const REGISTER_CELLS = [
    DATE_CELL_STYLE,
    REF_CELL_STYLE,
    TYPE_CELL_STYLE,
    MEMO_CELL_STYLE,
    ACCOUNT_CELL_STYLE,
    STATUS_CELL_STYLE,
    AMOUNT_CELL_STYLE,
    AMOUNT_CELL_STYLE,
    BALANCE_CELL_STYLE,
] as const

export const REGISTER_TABLE_MIN_WIDTH = tableMinWidth({
    cells: REGISTER_CELLS,
    gap: REGISTER_ROW_GAP,
    padding: REGISTER_ROW_PADDING,
})
