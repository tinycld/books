import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { type ReactNode, useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { GridItem, OpeningForm } from '../../hooks/useOpeningBalancesForm'
import { useRowWindow } from '../../hooks/useRowWindow'
import { formatMoney } from '../../lib/money'
import { bandIndexAt } from '../../lib/opening-window'
import { OpeningAccountCard } from './OpeningAccountCard'
import { OpeningAccountRow } from './OpeningAccountRow'
import { OpeningSectionBand, subtotalTone } from './OpeningSectionBand'
import { AMOUNT_STYLE, DETAIL_STYLE, NAME_STYLE, OPENING_ITEM_HEIGHT } from './opening-grid-style'

export { AMOUNT_STYLE, DETAIL_STYLE, NAME_STYLE, OPENING_ITEM_HEIGHT }

// Below this width the table scrolls sideways; no column collapses to blank.
export const TABLE_MIN_WIDTH = 560
const STICKY_BAND_HEIGHT = 36

type BandItem = Extract<GridItem, { kind: 'band' }>

function bandAt(items: readonly GridItem[], index: number): BandItem | undefined {
    const item = items[bandIndexAt(items, index)]
    return item?.kind === 'band' ? item : undefined
}

function HeadingText({ label, className = '' }: { label: string; className?: string }) {
    return <Text className={`text-xs font-medium text-muted-foreground ${className}`}>{label}</Text>
}

export function ColumnHeader({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="flex-row items-center gap-3 border-b border-border bg-background px-4 py-2">
            <View style={NAME_STYLE}>
                <HeadingText label="Account" />
            </View>
            <View style={DETAIL_STYLE}>
                <HeadingText label="Detail type" />
            </View>
            <View style={AMOUNT_STYLE}>
                <HeadingText label="Amount" className="text-right" />
            </View>
        </View>
    )
}

// Always shown, so the scroller never changes height as a band header crosses the top.
// While a band's own header is the first item in view, the same band appears twice
// one above the other; that is accepted over a bar that collapses and shifts the rows.
function StickyBand({ band, currency }: { band: BandItem | undefined; currency: string }) {
    return (
        <View
            testID="opening-sticky-band"
            className="flex-row items-center justify-between gap-3 overflow-hidden border-b border-border bg-surface-secondary px-4"
            style={{ height: STICKY_BAND_HEIGHT }}
        >
            <Text className="text-sm font-bold text-foreground">{band?.band.title ?? ''}</Text>
            <Text
                testID="opening-sticky-subtotal"
                className={`text-sm font-bold ${subtotalTone(band?.subtotal ?? 0)}`}
            >
                {formatMoney(band?.subtotal ?? 0, currency)}
            </Text>
        </View>
    )
}

function ItemView({
    item,
    model,
    currency,
    isWide,
}: {
    item: GridItem
    model: OpeningForm
    currency: string
    isWide: boolean
}) {
    if (item.kind === 'band') {
        const height = itemHeights(isWide).band
        return (
            <OpeningSectionBand
                band={item.band}
                subtotal={item.subtotal}
                currency={currency}
                height={height}
            />
        )
    }
    if (isWide) return <OpeningAccountRow row={item.row} model={model} />
    return <OpeningAccountCard row={item.row} model={model} />
}

function itemHeights(isWide: boolean) {
    return isWide ? OPENING_ITEM_HEIGHT.wide : OPENING_ITEM_HEIGHT.phone
}

interface OpeningAccountTableProps {
    model: OpeningForm
    currency: string
    isWide: boolean
    // Scrolls with the grid on phones, where a fixed date block would leave
    // too little room for the accounts.
    leading: ReactNode
}

function GridScroller({ model, currency, leading, isWide }: OpeningAccountTableProps) {
    const { items } = model
    const heights = useMemo(() => {
        const { band, row } = itemHeights(isWide)
        return items.map(item => (item.kind === 'band' ? band : row))
    }, [items, isWide])
    const rowWindow = useRowWindow({ total: items.length, heights, viewHeight: useWindowHeight() })
    const visible = items.slice(rowWindow.first, rowWindow.last).map(item => {
        const key = item.kind === 'band' ? `band-${item.band.group}` : item.row.account.id
        return <ItemView key={key} item={item} model={model} currency={currency} isWide={isWide} />
    })
    return (
        <ScrollView
            className="min-h-0 flex-1 web:[scrollbar-gutter:stable]"
            keyboardShouldPersistTaps="handled"
            // Native pins child 1 through stickyHeaderIndices and RN-web wraps it in a
            // sticky cell. The leading slot is always a View, even when empty, so the
            // header is child 1 on every layout and the index never depends on how an
            // empty child is counted.
            stickyHeaderIndices={[1]}
            onScroll={rowWindow.onScroll}
            scrollEventThrottle={16}
        >
            <View onLayout={rowWindow.onLeadingLayout}>{leading}</View>
            <View className="z-20 bg-background">
                <ColumnHeader isVisible={isWide} />
                <StickyBand band={bandAt(items, rowWindow.firstVisible)} currency={currency} />
            </View>
            <View style={{ height: rowWindow.topSpace }} />
            {visible}
            <View style={{ height: rowWindow.bottomSpace }} />
        </ScrollView>
    )
}

export function OpeningAccountTable(props: OpeningAccountTableProps) {
    if (!props.isWide) return <GridScroller {...props} />
    return (
        <ScrollView
            horizontal
            testID="opening-table"
            className="min-h-0 flex-1"
            contentContainerStyle={{ width: '100%', minWidth: TABLE_MIN_WIDTH }}
        >
            <View className="min-h-0 flex-1">
                <GridScroller {...props} />
            </View>
        </ScrollView>
    )
}
