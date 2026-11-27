import type { AdjustmentListRow } from '../hooks/useAdjustmentsQuery'
import type { BooksInventoryAdjustments } from '../types'
import { accountLabel } from './account-options'
import { itemAmountText } from './deposit'
import { formatDay } from './register-range'

// The inventory adjustments list (inventory-adjust spec §3.5): the Items cell, a row's
// texts, the chips' filters, the sorts, the table's columns and a card's second line.

type AdjustmentStatus = BooksInventoryAdjustments['status']
type AdjustmentKind = BooksInventoryAdjustments['kind']

export const DELETED_ITEM_TEXT = 'Deleted item'

// What a cell with nothing to say shows.
export const READ_DASH = '—'

/**
 * The Items cell in two parts: `name`, the first line's item name ("Deleted item" when its
 * item is gone), which may truncate, and `more`, " + n more" for the other lines (with its
 * leading space), which never does. Both '' for an adjustment with no line.
 */
export function adjustmentItemsParts(
    firstItemName: string | undefined,
    lineCount: number
): { name: string; more: string } {
    if (lineCount <= 0) return { name: '', more: '' }
    const name = firstItemName ?? DELETED_ITEM_TEXT
    const more = lineCount === 1 ? '' : ` + ${lineCount - 1} more`
    return { name, more }
}

/** The Items cell as one text: the first line's item name and "+ n more". */
export function adjustmentItemsText(firstItemName: string | undefined, lineCount: number) {
    const { name, more } = adjustmentItemsParts(firstItemName, lineCount)
    return `${name}${more}`
}

export type AdjustmentRowText = {
    date: string
    number: string
    itemName: string
    moreItems: string
    account: string
    value: string
}

// A list row's stored fields (useAdjustmentsQuery), without the live query's own fields.
type AdjustmentListFields = Pick<
    AdjustmentListRow,
    | 'id'
    | 'status'
    | 'kind'
    | 'number'
    | 'date'
    | 'value_change'
    | 'currency'
    | 'accountRow'
    | 'lines'
    | 'firstItemName'
    | 'lineCount'
>

// The texts of a row and a card: a draft has no number and no posted value yet ("—").
export function adjustmentRowText(row: AdjustmentListFields): AdjustmentRowText {
    const items = adjustmentItemsParts(row.firstItemName, row.lineCount)
    return {
        date: formatDay(row.date.slice(0, 10)),
        number: row.number || READ_DASH,
        itemName: items.name,
        moreItems: items.more,
        account: row.accountRow ? accountLabel(row.accountRow) : '',
        value: row.status === 'draft' ? READ_DASH : itemAmountText(row.value_change, row.currency),
    }
}

export type AdjustmentChip = 'all' | AdjustmentStatus

export const ADJUSTMENT_CHIPS: readonly { key: AdjustmentChip; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'posted', label: 'Posted' },
    { key: 'void', label: 'Void' },
]

const ALL_STATUSES: readonly AdjustmentStatus[] = ['draft', 'posted', 'void']
const MANUAL: readonly AdjustmentKind[] = ['manual']
// The kinds Books makes: the list shows them only under Made by Books.
export const BOOKS_MADE_KINDS: readonly AdjustmentKind[] = ['opening', 'recost']
const WITH_BOOKS_MADE: readonly AdjustmentKind[] = [...MANUAL, ...BOOKS_MADE_KINDS]

export type AdjustmentListFilter = {
    statuses: readonly AdjustmentStatus[]
    kinds: readonly AdjustmentKind[]
}

// The query's filter of a chip: All is every status, a status chip its own. The list shows
// manual adjustments; Made by Books adds the opening and re-cost ones.
export function adjustmentListFilter(
    chip: AdjustmentChip,
    madeByBooks: boolean
): AdjustmentListFilter {
    return {
        statuses: chip === 'all' ? ALL_STATUSES : [chip],
        kinds: madeByBooks ? WITH_BOOKS_MADE : MANUAL,
    }
}

// Date (the default, newest first), No. and Value change.
export type AdjustmentSort = 'date' | 'number' | 'value'

export type AdjustmentColumnKey = 'date' | 'number' | 'items' | 'account' | 'value' | 'status'

export type AdjustmentColumn = {
    key: AdjustmentColumnKey
    label: string
    minWidth: number
    align: 'left' | 'right'
    // The sort a press of the header picks; undefined for a column that does not sort.
    sort?: AdjustmentSort
}

export const ADJUSTMENT_COLUMNS: readonly AdjustmentColumn[] = [
    { key: 'date', label: 'Date', minWidth: 108, align: 'left', sort: 'date' },
    { key: 'number', label: 'No.', minWidth: 72, align: 'left', sort: 'number' },
    { key: 'items', label: 'Items', minWidth: 160, align: 'left' },
    { key: 'account', label: 'Account', minWidth: 150, align: 'left' },
    { key: 'value', label: 'Value change', minWidth: 116, align: 'right', sort: 'value' },
    { key: 'status', label: 'Status', minWidth: 96, align: 'left' },
]

export const ADJUSTMENT_ROW_MENU_WIDTH = 44
const TABLE_EDGES = 8

// 754 px: a table in the 956 px list of a 1280 window, cards in the 700 px of 1024.
export const ADJUSTMENT_TABLE_MIN_WIDTH =
    ADJUSTMENT_COLUMNS.reduce((sum, column) => sum + column.minWidth, 0) +
    ADJUSTMENT_ROW_MENU_WIDTH +
    TABLE_EDGES

// A card's second line: "IA-5 · Nov 3, 2026"; a draft, which has no number, its date alone.
export function adjustmentCardDetail(
    adjustment: Pick<BooksInventoryAdjustments, 'number' | 'date'>
): string {
    const day = formatDay(adjustment.date.slice(0, 10))
    if (!adjustment.number) return day
    return `${adjustment.number} · ${day}`
}
