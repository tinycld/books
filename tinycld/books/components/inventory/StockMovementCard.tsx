import { Pressable, Text, View } from 'react-native'
import type { StockMoveRow } from '../../hooks/useStockMoves'
import { moveViewOf, useOpenMove } from './StockMovementRow'

interface StockMovementCardProps {
    move: StockMoveRow
    hasBins: boolean
    // The page's gutter, so the card's text lines up with the page's other content.
    gutterClass: string
}

/**
 * One move as a card, below the table's own minimum width (inventory-adjust spec §3.6):
 * line 1 the transaction and the quantity; line 2 "<date> · <bin>" (the date alone while
 * the book has no bin) and the value; line 3 "On hand <n>". A press opens the transaction.
 */
export function StockMovementCard({ move, hasBins, gutterClass }: StockMovementCardProps) {
    const view = moveViewOf(move)
    const onPress = useOpenMove(move)
    const role = onPress ? 'button' : undefined
    const whereText = hasBins ? `${view.date} · ${view.bin}` : view.date
    return (
        <Pressable
            testID={`item-move-${move.id}`}
            accessibilityRole={role}
            disabled={onPress === undefined}
            onPress={onPress}
            className={`min-h-11 gap-0.5 border-b border-border py-2 ${gutterClass}`}
        >
            <View className="flex-row items-center gap-2">
                <Text
                    className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                    numberOfLines={1}
                >
                    {view.transaction}
                </Text>
                <Text className="text-sm font-semibold tabular-nums text-foreground">
                    {view.quantity}
                </Text>
            </View>
            <View className="flex-row items-center gap-2">
                <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                    {whereText}
                </Text>
                <Text className="text-xs tabular-nums text-muted-foreground">{view.value}</Text>
            </View>
            <Text className="text-xs text-muted-foreground">{`On hand ${view.onHand}`}</Text>
        </Pressable>
    )
}
