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
