import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { AdjustmentListRow } from '../../hooks/useAdjustmentsQuery'
import { adjustmentCardDetail, adjustmentRowText } from '../../lib/adjustment-list'
import { PartyMenuSlot } from '../party/PartyRowParts'
import { AdjustmentBadge, AdjustmentItemsText } from './adjustment-row-parts'

const ITEMS_TEXT = 'text-sm font-semibold text-foreground'

interface AdjustmentCardProps {
    adjustment: AdjustmentListRow
    height: number
    onOpen(id: string): void
    menu: ReactNode
}

/**
 * An adjustment as a card (inventory-adjust spec §3.5): line 1 the items text and the
 * value change, line 2 "<number> · <date>" and the badge. Drawn at exactly `height`, the
 * height the windowed card list sizes its spacers by; the open button and the menu are
 * siblings.
 */
export function AdjustmentCard({ adjustment, height, onOpen, menu }: AdjustmentCardProps) {
    const { id } = adjustment
    const text = adjustmentRowText(adjustment)
    const detail = adjustmentCardDetail(adjustment)
    const open = () => onOpen(id)
    return (
        <View
            testID={`inventory-adjustments-card-${id}`}
            className="flex-row border-b border-border bg-background pr-1"
            style={{ height }}
        >
            <Pressable
                role="button"
                onPress={open}
                className="min-w-0 flex-1 justify-center gap-1 pl-4"
            >
                <View className="flex-row items-center gap-2">
                    <AdjustmentItemsText
                        name={text.itemName}
                        more={text.moreItems}
                        className={ITEMS_TEXT}
                    />
                    <Text className="text-sm font-semibold tabular-nums text-foreground">
                        {text.value}
                    </Text>
                </View>
                <View className="flex-row items-center gap-2">
                    <Text
                        numberOfLines={1}
                        className="min-w-0 flex-1 text-xs text-muted-foreground"
                    >
                        {detail}
                    </Text>
                    <AdjustmentBadge status={adjustment.status} />
                </View>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
