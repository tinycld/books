// The wide footer's row, laid out on the lines grid's slots so the totals end where
// the Amount slot ends at every width. Core's wide grid draws, inside a field box's
// border, a row of slots (the first row kind's columns) TABLE_GRID_GAP apart, each
// `flex: <weight>` from a 0 basis with its `minWidth` floor, then the row menu's box.
// The footer row takes the same inset, gap and menu box, and draws a span per group of
// slots with the slots' summed weight, the gaps it covers as its basis, and the slots'
// summed floors plus those gaps as its floor. Both rows then share the same free width,
// and since every floored slot has one floor-to-weight ratio (document-line-columns.ts),
// all floors hold or release at one width: each span's edges fall on its slots' edges.

import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import {
    FIELD_CELL_BORDER_WIDTH,
    TABLE_GRID_GAP,
    TABLE_ROW_MENU_WIDTH,
} from '@tinycld/core/ui/forms/fields/table-layout'
import { DOCUMENT_LINE_COLUMNS, DOCUMENT_ROW_KINDS } from './document-line-columns'

// The slots the totals cover: they start at Qty and end at Amount.
const TOTALS_FIRST = 'quantity'
const TOTALS_LAST = 'amount'

export type FooterSpan = {
    flexGrow: number
    flexShrink: number
    flexBasis: number
    minWidth: number
}

// The wide footer row: the grid's gap, and the field box's border as its side inset.
export const DOCUMENT_FOOTER_ROW = {
    flexDirection: 'row',
    gap: TABLE_GRID_GAP,
    paddingHorizontal: FIELD_CELL_BORDER_WIDTH,
} as const

// The row menu's box at the end of the footer row.
export const DOCUMENT_FOOTER_MENU_SPACER = {
    width: TABLE_ROW_MENU_WIDTH,
    flexShrink: 0,
} as const

export type FooterSpans = { left: FooterSpan; totals: FooterSpan; right: FooterSpan }

// Core gives a column without `flex` the weight 1 and without `minWidth` the floor 0.
function spanOf(columns: readonly HostTableColumn[], keys: readonly string[]): FooterSpan {
    const columnOf = (key: string) => columns.find(column => column.key === key)
    const weight = keys.reduce((sum, key) => sum + (columnOf(key)?.flex ?? 1), 0)
    const floors = keys.reduce((sum, key) => sum + (columnOf(key)?.minWidth ?? 0), 0)
    const gaps = Math.max(keys.length - 1, 0) * TABLE_GRID_GAP
    return { flexGrow: weight, flexShrink: 1, flexBasis: gaps, minWidth: floors + gaps }
}

/**
 * The footer spans over one line table's wide grid (its columns and first row kind): left
 * of Qty, Qty through Amount, and after Amount (the sales lines' Taxable; none on a bill's
 * product table). A bill lays its footer on its product table, whose Amount slot has the
 * account table's size and place.
 */
export function footerSpansOf(
    columns: readonly HostTableColumn[],
    rowKinds: readonly HostRowKind[]
): FooterSpans {
    const slots = rowKinds[0]?.columns ?? []
    const first = slots.indexOf(TOTALS_FIRST)
    const last = slots.indexOf(TOTALS_LAST)
    return {
        left: spanOf(columns, slots.slice(0, first)),
        totals: spanOf(columns, slots.slice(first, last + 1)),
        right: spanOf(columns, slots.slice(last + 1)),
    }
}

export const DOCUMENT_FOOTER_SPANS = footerSpansOf(DOCUMENT_LINE_COLUMNS, DOCUMENT_ROW_KINDS)
