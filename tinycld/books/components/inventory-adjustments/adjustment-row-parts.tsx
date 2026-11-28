import { Text, View, type ViewStyle } from 'react-native'
import type { AdjustmentListRow } from '../../hooks/useAdjustmentsQuery'
import type { AdjustmentColumnKey } from '../../lib/adjustment-list'
import { statusBadgeOf } from '../../lib/document-lifecycle'
import { StatusBadge } from '../StatusBadge'

// The parts an inventory adjustment's row and card share (inventory-adjust spec §3.5).

export const ADJUSTMENT_ROW_HEIGHT = 52
export const ADJUSTMENT_CARD_HEIGHT = 72

// Items and Account take the room above their minimums; the other columns keep theirs.
const GROWS: Partial<Record<AdjustmentColumnKey, number>> = { items: 3, account: 2 }

export function adjustmentColumnStyle(key: AdjustmentColumnKey, minWidth: number): ViewStyle {
    const grow = GROWS[key]
    if (grow === undefined) return { width: minWidth, flexShrink: 0 }
    return { flexGrow: grow, flexShrink: 1, flexBasis: 0, minWidth }
}

/**
 * The Items text (adjustmentItemsParts): the item name truncates and " + n more" stays
 * whole beside it, so the count is never cut. `className` is the texts' size and weight.
 * The count's leading space is the gap after the name: the count has no `numberOfLines`,
 * because react-native-web gives a one-line Text `white-space: nowrap`, which drops a
 * leading space, and its default `pre-wrap` keeps it. `shrink-0` keeps the count on one
 * line at its full width.
 */
export function AdjustmentItemsText({
    name,
    more,
    className,
}: {
    name: string
    more: string
    className: string
}) {
    return (
        <View className="min-w-0 flex-1 flex-row items-center">
            <Text numberOfLines={1} className={`min-w-0 shrink ${className}`}>
                {name}
            </Text>
            <Text className={`shrink-0 ${className}`}>{more}</Text>
        </View>
    )
}

export function AdjustmentBadge({ status }: { status: AdjustmentListRow['status'] }) {
    const badge = statusBadgeOf('posting', status)
    if (!badge) return null
    return <StatusBadge label={badge.label} tone={badge.tone} />
}

export function AdjustmentCell({
    text,
    style,
    isNumber = false,
    isStrong = false,
}: {
    text: string
    style: ViewStyle
    isNumber?: boolean
    isStrong?: boolean
}) {
    const align = isNumber ? 'text-right tabular-nums' : ''
    const weight = isStrong ? 'font-medium' : ''
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm text-foreground ${align} ${weight}`}>
                {text}
            </Text>
        </View>
    )
}
