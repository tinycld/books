import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import {
    type ItemBinStockRow,
    type ItemBins,
    type ItemBinTransferRow,
    useItemBins,
} from '../../hooks/useItemBins'
import { binLabel } from '../../lib/adjustment-read'
import { transferText } from '../../lib/bin-list'
import { BINS_PATH } from '../../lib/bin-route'
import { NO_BIN } from '../../lib/inventory-adjust-fixture'
import { quantityText } from '../../lib/stock-display'
import type { BooksProducts } from '../../types'
import { TextLink } from '../payments/read-view-parts'
import { StockReadError } from './StockReadError'

const TAP = { minHeight: 44 }
const TABLE_STYLE = { maxWidth: 520 }
const HEAD = 'text-xs font-semibold uppercase text-muted-foreground'

function DefaultMark({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="rounded-full border border-border px-2">
            <Text className="text-xs text-muted-foreground">Default</Text>
        </View>
    )
}

function BinStockLine({ row, defaultBin }: { row: ItemBinStockRow; defaultBin: string }) {
    const isDefault = row.bin !== NO_BIN && row.bin === defaultBin
    const quantityClass =
        row.quantity < 0
            ? 'text-right text-sm tabular-nums text-warning'
            : 'text-right text-sm tabular-nums text-foreground'
    const label = binLabel(row.binRow)
    const quantity = quantityText(row.quantity)
    return (
        <View
            testID={`item-bin-${row.id}`}
            className="flex-row items-center gap-2 border-b border-border"
            style={TAP}
        >
            <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                {label}
            </Text>
            <DefaultMark isVisible={isDefault} />
            <View className="flex-1" />
            <Text className={quantityClass}>{quantity}</Text>
        </View>
    )
}

function TransferLine({ row }: { row: ItemBinTransferRow }) {
    const text = transferText(row, { from: row.from, to: row.to, user: row.userName ?? '' })
    return (
        <Text testID={`item-transfer-${row.id}`} className="text-sm text-foreground">
            {text}
        </Text>
    )
}

function ShowMore({ bins }: { bins: ItemBins }) {
    if (!bins.hasMoreTransfers) return null
    return (
        <Button
            testID="item-transfers-more"
            variant="outline"
            size="sm"
            style={TAP}
            className="self-start"
            onPress={bins.showMore}
            isDisabled={bins.isLoadingMore}
        >
            <ButtonText>Show more</ButtonText>
        </Button>
    )
}

function RecentMoves({ bins }: { bins: ItemBins }) {
    if (bins.transfers.length === 0) return null
    const lines = bins.transfers.map(row => <TransferLine key={row.id} row={row} />)
    return (
        <View testID="item-transfers" className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Recent moves</Text>
            {lines}
            <ShowMore bins={bins} />
        </View>
    )
}

function NoBins({ gutterClass }: { gutterClass: string }) {
    const orgHref = useOrgHref()
    const openBins = () => router.push(orgHref(BINS_PATH))
    return (
        <View testID="item-bins-empty" className={`items-center gap-2 p-8 ${gutterClass}`}>
            <Text className="text-base font-medium text-foreground">No bin locations yet</Text>
            <TextLink text="Bin locations" onPress={openBins} testID="item-bins-link" />
        </View>
    )
}

function BinRows({ bins, defaultBin }: { bins: ItemBins; defaultBin: string }) {
    const rows = bins.stockRows.map(row => (
        <BinStockLine key={row.id} row={row} defaultBin={defaultBin} />
    ))
    return (
        <View style={TABLE_STYLE}>
            <View className="flex-row items-center justify-between border-b border-border py-2">
                <Text className={HEAD}>Bin</Text>
                <Text className={HEAD}>Quantity</Text>
            </View>
            {rows}
        </View>
    )
}

interface ItemBinsTabProps {
    record: BooksProducts
    gutterClass: string
}

/**
 * The item page's Bins tab (inventory-adjust spec §3.8), in the page's one scroll: each bin
 * that holds a quantity of the item that is not 0, and No bin when it does (Bin ·
 * Quantity), the default bin marked "Default", a quantity below zero in `text-warning`, an
 * inactive bin with "(inactive)"; under it Recent moves, the newest 20 moves between bins
 * with Show more (useItemBins). While the book has no bin location: "No bin locations yet"
 * with a link to the Bin locations tab. Loading, and a load error with Retry.
 */
export function ItemBinsTab({ record, gutterClass }: ItemBinsTabProps) {
    const bins = useItemBins(record.id)
    if (bins.status === 'no-bins') return <NoBins gutterClass={gutterClass} />
    const isLoading = bins.status === 'loading'
    const isError = bins.status === 'error'
    const isReady = bins.status === 'ready'
    const loading = isLoading ? (
        <View testID="item-bins-loading" className="items-center p-8">
            <ActivityIndicator />
        </View>
    ) : null
    const content = isReady ? (
        <>
            <BinRows bins={bins} defaultBin={record.default_bin} />
            <RecentMoves bins={bins} />
        </>
    ) : null
    return (
        <View testID="item-bins-tab" className={`gap-6 pb-6 pt-3 ${gutterClass}`}>
            <StockReadError
                isVisible={isError}
                message="Could not load the bin locations of this item."
                onRetry={bins.retry}
                testID="item-bins-error"
            />
            {loading}
            {content}
        </View>
    )
}
