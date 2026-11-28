import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { ActivityIndicator, Text, View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import { useHasBinsQuery } from '../../hooks/useHasBins'
import type { StockMoveRow, StockMoves } from '../../hooks/useStockMoves'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { mergeRecoveries } from '../../lib/live-recovery'
import { MOVE_CHIPS, type MoveChip } from '../../lib/stock-move-chips'
import { ListFilterChips } from '../ListFilterChips'
import { StockMovementCard } from './StockMovementCard'
import { movesMinWidth, StockMovementRow, StockMovementsHeader } from './StockMovementRow'
import { StockReadError } from './StockReadError'

function chipOf(id: string): MoveChip {
    return MOVE_CHIPS.find(chip => chip.id === id)?.id ?? 'all'
}

interface MovesBodyProps {
    moves: readonly StockMoveRow[]
    hasBins: boolean
    showCards: boolean
    gutterClass: string
}

// The table never shows on a phone (useFitsTable), so its rows keep the page's 24 px
// gutter of the wider screens (MOVE_PADDING).
function MovesTable({ moves, hasBins }: Omit<MovesBodyProps, 'showCards' | 'gutterClass'>) {
    const rows = moves.map(move => <StockMovementRow key={move.id} move={move} hasBins={hasBins} />)
    return (
        <View testID="item-movements-table">
            <StockMovementsHeader hasBins={hasBins} />
            {rows}
        </View>
    )
}

function MovesCards({ moves, hasBins, gutterClass }: Omit<MovesBodyProps, 'showCards'>) {
    const cards = moves.map(move => (
        <StockMovementCard key={move.id} move={move} hasBins={hasBins} gutterClass={gutterClass} />
    ))
    return <View testID="item-movements-cards">{cards}</View>
}

function MovesBody({ moves, showCards, ...props }: MovesBodyProps) {
    if (moves.length === 0) {
        return (
            <View testID="item-movements-empty" className="items-center p-8">
                <Text className="text-center text-sm text-muted-foreground">
                    {INVENTORY_TEXTS.movementsEmpty}
                </Text>
            </View>
        )
    }
    if (showCards) return <MovesCards moves={moves} {...props} />
    return <MovesTable moves={moves} hasBins={props.hasBins} />
}

type MovesContent = 'loading' | 'error' | 'rows'

// A failed read of the moves or of the bin locations shows the error alone: a row whose
// bin could not be read would say "No bin", which is not true.
function contentOf(moves: StockMoves, bins: ReturnType<typeof useHasBinsQuery>): MovesContent {
    if (moves.isError || bins.isError) return 'error'
    if (!moves.isReady || !bins.isReady) return 'loading'
    return 'rows'
}

function errorTextOf(moves: StockMoves): string {
    return moves.isError
        ? 'Could not load the stock movements.'
        : 'Could not load the bin locations of the stock movements.'
}

interface StockMovementsListProps {
    // The page's read (useItemPage), whose one scroll loads the next page near its end.
    moves: StockMoves
    chip: MoveChip
    onSelectChip: (chip: MoveChip) => void
    isPhone: boolean
    gutterClass: string
}

/**
 * The item's movements (inventory-adjust spec §3.6 "Movements"): the chips All,
 * Receipts, Sales, Returns, Adjustments, then the moves newest first (useStockMoves), 50
 * at a time, in the item page's one scroll (ItemPage), which loads the next page near its
 * end. A table at the table's own minimum width of the page and wider (680 px, 568 with
 * no Bin column), cards below it; the Bin column shows while the book has a bin.
 * Loading, the empty text, and a load error with Retry for the moves' read and for the
 * bin locations' read; one Retry recovers both.
 */
export function StockMovementsList({
    moves,
    chip,
    onSelectChip,
    isPhone,
    gutterClass,
}: StockMovementsListProps) {
    const bins = useHasBinsQuery()
    const hasBins = bins.hasBins === true
    const fit = useFitsTable(movesMinWidth(hasBins))
    const selectChip = (id: string) => onSelectChip(chipOf(id))
    const chipsRowClass = isPhone ? '' : `flex-row flex-wrap items-center gap-2 ${gutterClass}`
    const content = contentOf(moves, bins)
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([moves.recovery, bins.recovery]),
            onError: err => log.error('books.item.stock-moves', err),
        })
    }
    const loading = (
        <View testID="item-movements-loading" className="items-center p-8">
            <ActivityIndicator />
        </View>
    )
    const rows = (
        <MovesBody
            moves={moves.moves}
            hasBins={hasBins}
            showCards={fit.showCards}
            gutterClass={gutterClass}
        />
    )
    const bodyByContent = { loading, error: null, rows }
    return (
        <View testID="item-movements" className="gap-2" onLayout={fit.onLayout}>
            <Text className={`text-sm font-semibold text-foreground ${gutterClass}`}>
                Movements
            </Text>
            <View className={chipsRowClass}>
                <ListFilterChips
                    chips={MOVE_CHIPS}
                    selected={chip}
                    testIdPrefix="item-moves-chip"
                    onSelect={selectChip}
                    scrolls={isPhone}
                    gutterClass={gutterClass}
                />
            </View>
            <View className={gutterClass}>
                <StockReadError
                    isVisible={content === 'error'}
                    message={errorTextOf(moves)}
                    onRetry={retry}
                    testID="item-movements-error"
                />
            </View>
            {bodyByContent[content]}
        </View>
    )
}
