import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ActivityIndicator, Text, View, type ViewStyle } from 'react-native'
import type { ItemStock, ReadStatus } from '../../hooks/useItemPage'
import { type ItemFigure, itemFigures, quantityText } from '../../lib/stock-display'
import type { BooksProducts } from '../../types'
import { StockReadError } from './StockReadError'

// Four figures in one row at this width of the page and wider; two by two below.
const FIGURE_ROW_MIN = 608
// Each cell's right padding is the space between two figures, inside the cell's 140 px:
// at a 608 px page the row inside the 24 px gutters is 560 px, four cells of 140.
const ROW_CELL: ViewStyle = { flex: 1, minWidth: 140, paddingRight: 12 }
const GRID_CELL: ViewStyle = { width: '50%', paddingRight: 12 }
const MARKER_STYLE: ViewStyle = { borderLeftWidth: 3 }

interface FigureProps {
    figure: ItemFigure
    markerClass: string
    style: ViewStyle
    // The fourth figure waits for the costing method and the cost layers.
    status: ReadStatus
}

function FigureValue({ figure, status }: Pick<FigureProps, 'figure' | 'status'>) {
    if (status === 'loading') return <ActivityIndicator size="small" />
    if (status === 'error') return <Text className="text-2xl font-semibold text-foreground">—</Text>
    return (
        <Text testID={figure.testID} className="text-2xl font-semibold text-foreground">
            {figure.text}
        </Text>
    )
}

function Figure({ figure, markerClass, style, status }: FigureProps) {
    return (
        <View style={style}>
            <View className={`gap-0.5 pl-3 ${markerClass}`} style={MARKER_STYLE}>
                <Text className="text-xs uppercase text-muted-foreground">{figure.label}</Text>
                <FigureValue figure={figure} status={status} />
            </View>
        </View>
    )
}

function ReorderLine({ reorderPoint }: { reorderPoint: number }) {
    if (reorderPoint <= 0) return null
    return (
        <Text testID="item-reorder-point" className="text-sm text-muted-foreground">
            {`Reorder point ${quantityText(reorderPoint)}`}
        </Text>
    )
}

interface StockFiguresProps {
    record: BooksProducts
    stock: ItemStock
    isPhone: boolean
    gutterClass: string
}

/**
 * The item's figures (inventory-adjust spec §3.6 "Figures"): On hand, On PO, Stock value
 * and the cost by the book's costing method (`itemFigures`), in one row at 608 px of the
 * page and wider (each at least 140 px), two by two below; then "Reorder point <n>" when
 * the item has one. On hand is marked while the item is low. The cost waits for the
 * costing method and the layers; a failed read shows its error with Retry.
 */
export function StockFigures({ record, stock, isPhone, gutterClass }: StockFiguresProps) {
    // The page's width: this view spans it, gutters included.
    const { width, onLayout } = useContainerWidth()
    const isRow = width > 0 ? width >= FIGURE_ROW_MIN : !isPhone
    const cell = isRow ? ROW_CELL : GRID_CELL
    const rowClass = isRow ? 'flex-row' : 'flex-row flex-wrap gap-y-3'
    const figures = itemFigures({
        item: record,
        costing: stock.costing,
        layers: stock.layers,
    })
    const onHandMarker = record.low_stock ? 'border-warning' : 'border-border'
    const markerOf = (figure: ItemFigure) =>
        figure.key === 'on_hand' ? onHandMarker : 'border-border'
    const statusOf = (figure: ItemFigure): ReadStatus =>
        figure.key === 'cost' ? stock.costStatus : 'ready'
    const cells = figures.map(figure => (
        <Figure
            key={figure.key}
            figure={figure}
            markerClass={markerOf(figure)}
            style={cell}
            status={statusOf(figure)}
        />
    ))
    return (
        <View
            testID="item-figures"
            className={`gap-2 pb-4 pt-1 ${gutterClass}`}
            onLayout={onLayout}
        >
            <View className={rowClass}>{cells}</View>
            <StockReadError
                isVisible={stock.costStatus === 'error'}
                message="Could not load the item's cost."
                onRetry={stock.retry}
                testID="item-figures-error"
            />
            <ReorderLine reorderPoint={record.reorder_point} />
        </View>
    )
}
