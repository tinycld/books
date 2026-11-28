import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import type { ItemStock } from '../../hooks/useItemPage'
import type { StockLayerRow } from '../../hooks/useStockLayers'
import { formatMoney, roundHalfAwayFromZero } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { quantityText } from '../../lib/stock-display'
import { tableMinWidth } from '../../lib/table-fit'
import { StockReadError } from './StockReadError'

const TAP = { minHeight: 44 }
const ROWS_STYLE: ViewStyle = { maxWidth: 520 }
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const CELL = 'text-sm text-foreground'
const NUMBER_CELL = 'text-right text-sm tabular-nums text-foreground'

// Every column flexes above its minimum; "Quantity left" sets its column's.
const COLUMNS = {
    date: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 96 },
    quantity: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 120 },
    unit: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 88 },
    value: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 96 },
} as const

const LAYER_GAP = 8

// The table's own minimum: 424 px (columns 400 and three 8 px gaps, the rows' `gap-2`;
// the row has no padding of its own, the section's gutter is outside it).
const LAYERS_MIN_WIDTH = tableMinWidth({
    cells: Object.values(COLUMNS),
    gap: LAYER_GAP,
    padding: 0,
})

// A layer received on no known day (an opening layer of an old book) has no date.
function receivedText(date: string): string {
    return date ? formatDay(date) : '—'
}

function layerViewOf(layer: StockLayerRow) {
    const unitCost = roundHalfAwayFromZero(layer.value / layer.quantity)
    return {
        received: receivedText(layer.date),
        quantity: quantityText(layer.quantity),
        unitCost: formatMoney(unitCost, layer.currency),
        value: formatMoney(layer.value, layer.currency),
    }
}

function LayerRow({ layer }: { layer: StockLayerRow }) {
    const view = layerViewOf(layer)
    return (
        <View
            testID={`item-layer-${layer.id}`}
            className="flex-row items-center gap-2 border-b border-border py-2"
        >
            <Text className={CELL} style={COLUMNS.date}>
                {view.received}
            </Text>
            <Text className={NUMBER_CELL} style={COLUMNS.quantity}>
                {view.quantity}
            </Text>
            <Text className={NUMBER_CELL} style={COLUMNS.unit}>
                {view.unitCost}
            </Text>
            <Text className={NUMBER_CELL} style={COLUMNS.value}>
                {view.value}
            </Text>
        </View>
    )
}

// One layer as a card, below the table's own minimum: "Received <date>"; "Quantity left
// <n>" and "Unit cost <money>"; "Value <money>".
function LayerCard({ layer }: { layer: StockLayerRow }) {
    const view = layerViewOf(layer)
    return (
        <View testID={`item-layer-${layer.id}`} className="gap-0.5 border-b border-border py-2">
            <Text className="text-sm font-semibold text-foreground">{`Received ${view.received}`}</Text>
            <View className="flex-row flex-wrap items-center gap-x-3">
                <Text className="text-sm tabular-nums text-foreground">
                    {`Quantity left ${view.quantity}`}
                </Text>
                <Text className="text-sm tabular-nums text-foreground">
                    {`Unit cost ${view.unitCost}`}
                </Text>
            </View>
            <Text className="text-xs tabular-nums text-muted-foreground">
                {`Value ${view.value}`}
            </Text>
        </View>
    )
}

function LayersTable({ layers }: { layers: readonly StockLayerRow[] }) {
    const rows = layers.map(layer => <LayerRow key={layer.id} layer={layer} />)
    return (
        <View testID="item-layers-rows" style={ROWS_STYLE}>
            <View className="flex-row items-center gap-2 border-b border-border py-2">
                <Text className={HEAD} style={COLUMNS.date}>
                    Received
                </Text>
                <Text className={`${HEAD} text-right`} style={COLUMNS.quantity}>
                    Quantity left
                </Text>
                <Text className={`${HEAD} text-right`} style={COLUMNS.unit}>
                    Unit cost
                </Text>
                <Text className={`${HEAD} text-right`} style={COLUMNS.value}>
                    Value
                </Text>
            </View>
            {rows}
        </View>
    )
}

function LayersCards({ layers }: { layers: readonly StockLayerRow[] }) {
    const cards = layers.map(layer => <LayerCard key={layer.id} layer={layer} />)
    return <View testID="item-layers-cards">{cards}</View>
}

interface LayerRowsProps {
    stock: ItemStock
    isOpen: boolean
    showCards: boolean
}

function LayerRows({ stock, isOpen, showCards }: LayerRowsProps) {
    if (!isOpen || stock.layersStatus !== 'ready') return null
    if (stock.layers.length === 0) {
        return <Text className="py-2 text-sm text-muted-foreground">No open cost layers.</Text>
    }
    if (showCards) return <LayersCards layers={stock.layers} />
    return <LayersTable layers={stock.layers} />
}

function LayerCount({ stock }: { stock: ItemStock }) {
    if (stock.layersStatus === 'loading') return <ActivityIndicator size="small" />
    if (stock.layersStatus === 'error') return null
    return <Text className="text-sm text-muted-foreground">{String(stock.layers.length)}</Text>
}

interface CostLayersProps {
    stock: ItemStock
    gutterClass: string
}

/**
 * "Cost layers" on a FIFO book (inventory-adjust spec §3.6 "Stock tab"): closed at the
 * start; open, one row for each open layer, oldest first (useStockLayers): Received ·
 * Quantity left · Unit cost · Value. Below the table's own minimum width (on a phone, or a
 * section narrower than LAYERS_MIN_WIDTH) each layer is a card, so the table never scrolls
 * sideways. An average-cost book has no such section. A failed read shows its error with
 * Retry.
 */
export function CostLayers({ stock, gutterClass }: CostLayersProps) {
    // Local, synchronous UI state: whether the section is open.
    const [isOpen, setOpen] = useState(false)
    const fit = useFitsTable(LAYERS_MIN_WIDTH)
    if (stock.costing !== 'fifo') return null
    const mark = isOpen ? '▾' : '▸'
    const toggle = () => setOpen(open => !open)
    return (
        <View testID="item-cost-layers" className={gutterClass}>
            <View onLayout={fit.onLayout}>
                <Pressable
                    testID="item-cost-layers-toggle"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    aria-expanded={isOpen}
                    onPress={toggle}
                    className="flex-row items-center gap-2 self-start"
                    style={TAP}
                >
                    <Text className="text-sm text-muted-foreground">{mark}</Text>
                    <Text className="text-sm font-semibold text-foreground">Cost layers</Text>
                    <LayerCount stock={stock} />
                </Pressable>
                <StockReadError
                    isVisible={stock.layersStatus === 'error'}
                    message="Could not load the cost layers."
                    onRetry={stock.retry}
                    testID="item-cost-layers-error"
                />
                <LayerRows stock={stock} isOpen={isOpen} showCards={fit.showCards} />
            </View>
        </View>
    )
}
