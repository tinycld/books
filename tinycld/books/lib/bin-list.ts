import type { BooksBins, BooksBinTransfers } from '../types'
import { binLabel } from './adjustment-read'
import { quantityText } from './stock-display'

// The bin list (inventory-adjust spec §3.7): the row menu, the Status cell, the table's
// columns and the bin dialog's state; and the Recent moves line of the item page's Bins
// tab (§3.8).

export type BinRowAction = 'edit' | 'make-inactive' | 'make-active' | 'delete'

export const BIN_ROW_MENU_LABELS: Record<BinRowAction, string> = {
    edit: 'Edit',
    'make-inactive': 'Make inactive',
    'make-active': 'Make active',
    delete: 'Delete',
}

// Every item writes, so a reader has none.
export function binRowMenuItems(
    bin: Pick<BooksBins, 'inactive'>,
    canWrite: boolean
): BinRowAction[] {
    if (!canWrite) return []
    const toggle: BinRowAction = bin.inactive ? 'make-active' : 'make-inactive'
    return ['edit', toggle, 'delete']
}

// The Status cell: blank for an active bin.
export function binStatusText(bin: Pick<BooksBins, 'inactive'>): string {
    return bin.inactive ? 'Inactive' : ''
}

// Shared by the header and every row, so the columns line up. Name and Note flex above
// their minimums; Status and the row menu keep their widths.
export const BIN_COLUMNS = {
    name: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 160 },
    note: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 160 },
    status: { width: 96, flexShrink: 0 },
    menu: { width: 44, flexShrink: 0 },
} as const

const BIN_ROW_PADDING = 24

// 484 px: below it the list shows cards.
export const BIN_TABLE_MIN_WIDTH =
    BIN_COLUMNS.name.minWidth +
    BIN_COLUMNS.note.minWidth +
    BIN_COLUMNS.status.width +
    BIN_COLUMNS.menu.width +
    BIN_ROW_PADDING

// A side of a move: its bin by materialize(), undefined for No bin.
export type TransferBin = { name: string; inactive: boolean } | undefined

export type TransferNames = { from: TransferBin; to: TransferBin; user: string }

// The reader's local day of a move, as "Nov 3" (no year): the stamp is stored in UTC and
// shown in local time, as the package's other stamps (formatDateTime, lib/entry-display.ts).
// A move the server has not stored yet (pbtsdb's optimistic row) has no `created`: it
// takes the local day of `now`, the moment the server's autodate will stamp.
function transferDay(created: string | undefined, now: Date): string {
    const when = created ? new Date(created.replace(' ', 'T')) : now
    if (Number.isNaN(when.getTime())) return ''
    return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * A Recent moves line: "Nov 3 · 4 from Aisle 3 to Front counter · Ana Ruiz". An empty side
 * is "No bin" and an inactive bin has " (inactive)" (binLabel); a move whose user is gone
 * has no user part. An unstored move (no `created`) is dated by `now` (transferDay).
 */
export function transferText(
    transfer: Pick<BooksBinTransfers, 'quantity'> & Partial<Pick<BooksBinTransfers, 'created'>>,
    names: TransferNames,
    now: Date = new Date()
): string {
    const move = `${transferDay(transfer.created, now)} · ${quantityText(transfer.quantity)} from ${binLabel(names.from)} to ${binLabel(names.to)}`
    if (names.user === '') return move
    return `${move} · ${names.user}`
}

export type BinDialogTarget = { mode: 'new' } | { mode: 'edit'; id: string }

export type BinDialogState = 'form' | 'loading' | 'load-error' | 'gone'

export type BinDialogStateInput = {
    mode: BinDialogTarget['mode']
    isLoading: boolean
    isError: boolean
    record: Pick<BooksBins, 'id'> | undefined
}

/**
 * What the bin dialog draws (useBinDialog returns it, BinDialog draws by it): the form for
 * a new bin; for an edit, `loading` while the bin loads, `load-error` on a failed load
 * (DialogLoadError with Retry and no Save), the form once the bin is there, and `gone`
 * when the load ends with no row (a bin deleted elsewhere: the dialog closes).
 */
export function binDialogState({
    mode,
    isLoading,
    isError,
    record,
}: BinDialogStateInput): BinDialogState {
    if (mode === 'new') return 'form'
    if (isError) return 'load-error'
    if (record) return 'form'
    if (isLoading) return 'loading'
    return 'gone'
}
