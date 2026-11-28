import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View, type ViewStyle } from 'react-native'
import {
    type AdjustmentReadColumn,
    type AdjustmentReadColumnKey,
    adjustmentReadColumns,
    adjustmentReadMinWidth,
    type ReadLineCells,
} from '../../lib/adjustment-read'

const TAP = { minHeight: 44 }
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const CELL = 'text-sm text-foreground'
const NUMBER_CELL = 'text-right text-sm tabular-nums text-foreground'
// The screen's side padding (16 px each side): the table's minimum counts it.
const SCREEN_GUTTER = 32

// Item and Bin take the room above their minimums; Change and Value change keep theirs.
const GROWS: Partial<Record<AdjustmentReadColumnKey, number>> = { item: 2, bin: 1 }

function columnStyle(column: AdjustmentReadColumn): ViewStyle {
    const grow = GROWS[column.key]
    if (grow === undefined) return { width: column.minWidth, flexShrink: 0 }
    return { flexGrow: grow, flexShrink: 1, flexBasis: 0, minWidth: column.minWidth }
}

function ReadTable({
    lines,
    columns,
}: {
    lines: readonly ReadLineCells[]
    columns: readonly AdjustmentReadColumn[]
}) {
    const head = columns.map(column => {
        const align = column.align === 'right' ? ' text-right' : ''
        return (
            <Text key={column.key} className={`${HEAD}${align}`} style={columnStyle(column)}>
                {column.label}
            </Text>
        )
    })
    const rows = lines.map(line => {
        const cells = columns.map(column => {
            const isNumber = column.align === 'right'
            return (
                <Text
                    key={column.key}
                    className={isNumber ? NUMBER_CELL : CELL}
                    style={columnStyle(column)}
                    numberOfLines={column.key === 'item' ? 2 : 1}
                >
                    {line[column.key]}
                </Text>
            )
        })
        return (
            <View
                key={line.id}
                testID={`adjustment-read-line-${line.id}`}
                className="flex-row items-center gap-2 border-b border-border px-2"
                style={TAP}
            >
                {cells}
            </View>
        )
    })
    return (
        <View testID="inventory-adjustment-read-lines-table">
            <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
                {head}
            </View>
            {rows}
        </View>
    )
}

function BinLine({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return (
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
            {text}
        </Text>
    )
}

function ReadCards({ lines, hasBins }: { lines: readonly ReadLineCells[]; hasBins: boolean }) {
    const cards = lines.map(line => (
        <View
            key={line.id}
            testID={`adjustment-read-line-${line.id}`}
            className="gap-1 rounded-xl border border-border bg-background p-3"
        >
            <View className="flex-row items-start gap-2">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {line.item}
                </Text>
                <Text className="text-sm font-semibold tabular-nums text-foreground">
                    {line.value}
                </Text>
            </View>
            <View className="flex-row items-center justify-end gap-2">
                <BinLine isVisible={hasBins} text={line.bin} />
                <Text className="text-xs tabular-nums text-muted-foreground">{`Change ${line.change}`}</Text>
            </View>
        </View>
    ))
    return (
        <View testID="inventory-adjustment-read-lines-cards" className="gap-3">
            {cards}
        </View>
    )
}

interface AdjustmentReadLinesProps {
    lines: readonly ReadLineCells[]
    // Whether to draw the Bin column (cards: the bin line).
    hasBins: boolean
}

/**
 * The read view's lines (inventory-adjust spec §3.5): Item · Bin · Change · Value change,
 * a table while its section is 588 px wide or more with the screen's gutter (468 with no
 * Bin column), cards below it.
 */
export function AdjustmentReadLines({ lines, hasBins }: AdjustmentReadLinesProps) {
    const { width, onLayout } = useContainerWidth()
    const columns = adjustmentReadColumns(hasBins)
    const isCards = width > 0 && width + SCREEN_GUTTER < adjustmentReadMinWidth(hasBins)
    const body = isCards ? (
        <ReadCards lines={lines} hasBins={hasBins} />
    ) : (
        <ReadTable lines={lines} columns={columns} />
    )
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">Lines</Text>
            {body}
        </View>
    )
}
