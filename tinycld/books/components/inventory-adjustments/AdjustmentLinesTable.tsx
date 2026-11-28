import { Text, View } from 'react-native'
import {
    type AdjustmentLineColumn,
    type AdjustmentLineColumnKey,
    adjustmentLineColumns,
} from '../../lib/adjustment-columns'
import {
    type AdjustmentLinesProps,
    BinCell,
    ChangeCell,
    ItemCell,
    type LineCellProps,
    LineError,
    LineMenu,
    lineCellPropsOf,
    lineRowId,
    NewQuantityCell,
    OnHandCell,
    ValueCell,
} from './AdjustmentLineCells'

const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

// A cell's content by its column.
function CellContent({ column, props }: { column: AdjustmentLineColumnKey; props: LineCellProps }) {
    if (column === 'item') return <ItemCell {...props} />
    if (column === 'bin') return <BinCell {...props} />
    if (column === 'onHand')
        return <OnHandCell view={props.view} index={props.index} isInline={false} />
    if (column === 'newQuantity') return <NewQuantityCell {...props} />
    if (column === 'change') return <ChangeCell {...props} />
    if (column === 'value') return <ValueCell {...props} />
    return <LineMenu {...props} />
}

function LineRow({
    props,
    columns,
}: {
    props: LineCellProps
    columns: readonly AdjustmentLineColumn[]
}) {
    const { lineFocus, line, index } = props
    const onFocus = () => lineFocus.onFocus(line.id)
    const onBlur = () => lineFocus.onBlur(line.id)
    const cells = columns.map(column => (
        <View key={column.key} style={column.cell}>
            <CellContent column={column.key} props={props} />
        </View>
    ))
    return (
        <View
            testID={lineRowId(index)}
            className="gap-1 border-b border-border px-2 py-1"
            onFocus={onFocus}
            onBlur={onBlur}
        >
            <View className="flex-row items-start gap-2">{cells}</View>
            <LineError view={props.view} index={index} />
        </View>
    )
}

/**
 * The adjustment's lines as a table (inventory-adjust spec §3.3), at or above its least
 * width (`adjustmentLinesMinWidth`): the header row and one row per line, Item, Bin (while
 * the book has a bin), On hand, New quantity, Change, Value change and the row menu, every
 * column from adjustmentLineColumns so it lines up from the header down. The columns flex
 * above their least widths, so it never scrolls sideways. A line's own message shows under
 * its row.
 */
export function AdjustmentLinesTable(props: AdjustmentLinesProps) {
    const columns = adjustmentLineColumns(props.hasBins)
    const head = columns.map(column => (
        <Text
            key={column.key}
            className={column.align === 'right' ? `${HEAD} text-right` : HEAD}
            style={column.cell}
        >
            {column.label}
        </Text>
    ))
    const rows = props.fields.map((field, index) => {
        const cellProps = lineCellPropsOf(props, index)
        if (!cellProps) return null
        return <LineRow key={field.key} props={cellProps} columns={columns} />
    })
    return (
        <View testID="inventory-adjustment-lines-table">
            <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
                {head}
            </View>
            {rows}
        </View>
    )
}
