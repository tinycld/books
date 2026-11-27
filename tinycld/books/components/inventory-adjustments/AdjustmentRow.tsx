import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import type { AdjustmentListRow } from '../../hooks/useAdjustmentsQuery'
import { ADJUSTMENT_COLUMNS, adjustmentRowText } from '../../lib/adjustment-list'
import { PartyMenuSlot, selectedProps } from '../party/PartyRowParts'
import {
    ADJUSTMENT_ROW_HEIGHT,
    AdjustmentBadge,
    AdjustmentCell,
    AdjustmentItemsText,
    adjustmentColumnStyle,
} from './adjustment-row-parts'

const COLUMN_STYLES = Object.fromEntries(
    ADJUSTMENT_COLUMNS.map(column => [
        column.key,
        adjustmentColumnStyle(column.key, column.minWidth),
    ])
)

const ROW_STYLE = { height: ADJUSTMENT_ROW_HEIGHT }
const ITEMS_TEXT = 'text-sm font-medium text-foreground'

interface AdjustmentRowProps {
    adjustment: AdjustmentListRow
    // The open adjustment's row on the panel surface.
    isSelected: boolean
    onOpen(id: string): void
    menu: ReactNode
}

// As ProductRow: the button that opens the adjustment (its cells) and the menu are
// siblings, so a press on the menu never opens the adjustment.
export function AdjustmentRow({ adjustment, isSelected, onOpen, menu }: AdjustmentRowProps) {
    const { id } = adjustment
    const text = adjustmentRowText(adjustment)
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    const open = () => onOpen(id)
    return (
        <View
            testID={`inventory-adjustments-row-${id}`}
            className={`flex-row border-b border-border pr-1 ${bg}`}
            style={ROW_STYLE}
        >
            <Pressable
                role="button"
                {...selectedProps(isSelected)}
                onPress={open}
                className="min-w-0 flex-1 flex-row items-center pl-4"
            >
                <AdjustmentCell text={text.date} style={COLUMN_STYLES.date} />
                <AdjustmentCell text={text.number} style={COLUMN_STYLES.number} />
                <View className="min-w-0 pr-3" style={COLUMN_STYLES.items}>
                    <AdjustmentItemsText
                        name={text.itemName}
                        more={text.moreItems}
                        className={ITEMS_TEXT}
                    />
                </View>
                <AdjustmentCell text={text.account} style={COLUMN_STYLES.account} />
                <AdjustmentCell text={text.value} style={COLUMN_STYLES.value} isNumber />
                <View className="items-start pr-3" style={COLUMN_STYLES.status}>
                    <AdjustmentBadge status={adjustment.status} />
                </View>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
