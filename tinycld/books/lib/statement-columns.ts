import type { ViewStyle } from 'react-native'

// The create screen's recipients table (statements spec §3.3). The heading and the rows
// share these, so the columns line up. Recipient and Email address grow from their
// minimums; the tick box and Balance keep their width.
export const RECIPIENT_COLUMNS = {
    tick: { width: 44 },
    name: { flex: 3, minWidth: 180 },
    email: { flex: 3, minWidth: 220 },
    balance: { width: 120 },
} satisfies Record<string, ViewStyle>

export const RECIPIENT_CELL_GAP = 12
export const RECIPIENT_ROW_PADDING = 8

// The table's own minimum width (616 px): below it the list draws cards, so it never
// scrolls sideways.
export const RECIPIENT_TABLE_MIN_WIDTH =
    RECIPIENT_COLUMNS.tick.width +
    RECIPIENT_COLUMNS.name.minWidth +
    RECIPIENT_COLUMNS.email.minWidth +
    RECIPIENT_COLUMNS.balance.width +
    3 * RECIPIENT_CELL_GAP +
    2 * RECIPIENT_ROW_PADDING

// The customer page's Statements tab (statements spec §3.7). The heading and the rows share
// these. Sent takes the spare width: it holds an address.
export const STATEMENT_TAB_COLUMNS = {
    date: { flex: 1, minWidth: 104 },
    number: { flex: 1, minWidth: 92 },
    type: { flex: 1.1, minWidth: 120 },
    period: { flex: 1.6, minWidth: 172 },
    amount: { flex: 1, minWidth: 104 },
    sent: { flex: 2.4, minWidth: 200 },
    menu: { width: 44 },
} satisfies Record<string, ViewStyle>

// The row's padding, both sides together.
export const STATEMENT_TAB_ROW_PADDING = 24
export const STATEMENT_TAB_ROW_HEIGHT = 48
export const STATEMENT_TAB_CARD_HEIGHT = 104

// The table's own minimum width (860 px): the columns at their minimums, the row padding and
// the row menu's cell. Below it the tab draws cards, so it never scrolls sideways.
export const STATEMENT_TAB_MIN_WIDTH =
    STATEMENT_TAB_COLUMNS.date.minWidth +
    STATEMENT_TAB_COLUMNS.number.minWidth +
    STATEMENT_TAB_COLUMNS.type.minWidth +
    STATEMENT_TAB_COLUMNS.period.minWidth +
    STATEMENT_TAB_COLUMNS.amount.minWidth +
    STATEMENT_TAB_COLUMNS.sent.minWidth +
    STATEMENT_TAB_ROW_PADDING +
    STATEMENT_TAB_COLUMNS.menu.width
