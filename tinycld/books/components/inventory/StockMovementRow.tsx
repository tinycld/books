import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import type { StockMoveRow } from '../../hooks/useStockMoves'
import { binLabel, quantityChangeText } from '../../lib/adjustment-read'
import { itemAmountText } from '../../lib/deposit'
import { formatDay } from '../../lib/register-range'
import { quantityText } from '../../lib/stock-display'
import { moveTransactionText, stockSourceRouteBase } from '../../lib/stock-move-link'
import { tableMinWidth } from '../../lib/table-fit'

const ROW_STYLE: ViewStyle = { minHeight: 44 }
export const MOVE_HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const CELL = 'text-sm text-foreground'
const NUMBER_CELL = 'text-right text-sm tabular-nums text-foreground'
const ROW_CLASS = 'flex-row items-center gap-2 border-b border-border px-6 py-1'

// The columns' minimums (inventory-adjust spec §3.6 "Movements"): Date 92, Transaction
// 140, Bin 104, Quantity 76, Value 96, On hand 84; 8 px gaps and 24 px padding each side.
export const MOVE_COLUMNS = {
    date: { width: 92, flexShrink: 0 },
    transaction: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 140 },
    bin: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 104 },
    quantity: { width: 76, flexShrink: 0 },
    value: { width: 96, flexShrink: 0 },
    onHand: { width: 84, flexShrink: 0 },
} as const

const MOVE_GAP = 8
const MOVE_PADDING = 48

// 680 px with the Bin column, 568 without it.
export function movesMinWidth(hasBins: boolean): number {
    const { bin, ...rest } = MOVE_COLUMNS
    const cells = hasBins ? Object.values(MOVE_COLUMNS) : Object.values(rest)
    return tableMinWidth({ cells, gap: MOVE_GAP, padding: MOVE_PADDING })
}

// A move's cell texts: the quantity and the value signed, U+2212 for a minus.
export function moveViewOf(move: StockMoveRow) {
    return {
        date: formatDay(move.date),
        transaction: moveTransactionText(move),
        bin: binLabel(move.binRow),
        quantity: quantityChangeText(move.quantity),
        value: itemAmountText(move.value, move.currency),
        onHand: quantityText(move.quantity_after),
    }
}

export type MoveView = ReturnType<typeof moveViewOf>

/**
 * What a press on a move does: it opens the move's transaction (an opening stock its
 * adjustment's read view) through `useOpenDocument`, which pops back to that screen when
 * it is below this page. Undefined for a move whose source no Books screen shows.
 */
export function useOpenMove(move: StockMoveRow): (() => void) | undefined {
    const routeBase = stockSourceRouteBase(move.source)
    const open = useOpenDocument({ routeBase: routeBase ?? '' }, move.document)
    if (routeBase === null || move.document === '') return undefined
    return open
}

function BinCell({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return (
        <Text className={CELL} style={MOVE_COLUMNS.bin} numberOfLines={1}>
            {text}
        </Text>
    )
}

function BinHead({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className={MOVE_HEAD} style={MOVE_COLUMNS.bin}>
            Bin
        </Text>
    )
}

// The movements table's header row.
export function StockMovementsHeader({ hasBins }: { hasBins: boolean }) {
    return (
        <View className={ROW_CLASS} style={ROW_STYLE}>
            <Text className={MOVE_HEAD} style={MOVE_COLUMNS.date}>
                Date
            </Text>
            <Text className={MOVE_HEAD} style={MOVE_COLUMNS.transaction}>
                Transaction
            </Text>
            <BinHead isVisible={hasBins} />
            <Text className={`${MOVE_HEAD} text-right`} style={MOVE_COLUMNS.quantity}>
                Quantity
            </Text>
            <Text className={`${MOVE_HEAD} text-right`} style={MOVE_COLUMNS.value}>
                Value
            </Text>
            <Text className={`${MOVE_HEAD} text-right`} style={MOVE_COLUMNS.onHand}>
                On hand
            </Text>
        </View>
    )
}

interface StockMovementRowProps {
    move: StockMoveRow
    hasBins: boolean
}

// One move as a table row: Date · Transaction · Bin · Quantity · Value · On hand. The
// Transaction text wraps, so the kind's word and the whole number show at every table
// width (a narrow cell makes the row taller).
export function StockMovementRow({ move, hasBins }: StockMovementRowProps) {
    const view = moveViewOf(move)
    const onPress = useOpenMove(move)
    const role = onPress ? 'button' : undefined
    return (
        <Pressable
            testID={`item-move-${move.id}`}
            accessibilityRole={role}
            disabled={onPress === undefined}
            onPress={onPress}
            className={ROW_CLASS}
            style={ROW_STYLE}
        >
            <Text className={CELL} style={MOVE_COLUMNS.date} numberOfLines={1}>
                {view.date}
            </Text>
            <Text className={`${CELL} font-medium`} style={MOVE_COLUMNS.transaction}>
                {view.transaction}
            </Text>
            <BinCell isVisible={hasBins} text={view.bin} />
            <Text className={NUMBER_CELL} style={MOVE_COLUMNS.quantity}>
                {view.quantity}
            </Text>
            <Text className={NUMBER_CELL} style={MOVE_COLUMNS.value}>
                {view.value}
            </Text>
            <Text className={NUMBER_CELL} style={MOVE_COLUMNS.onHand}>
                {view.onHand}
            </Text>
        </Pressable>
    )
}
