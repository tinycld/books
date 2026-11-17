import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { Fragment, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Pressable,
    ScrollView,
    type ScrollViewInstance,
    Text,
    View,
    type ViewStyle,
} from 'react-native'
import { useRowWindow } from '../hooks/useRowWindow'
import { useTableMinWidth } from '../hooks/useTableMinWidth'
import { PARTY_ROW_CLASS } from '../lib/party-list'
import { scrollIntoViewY } from '../lib/scroll-into-view'

type ListTableProps<Row> = {
    testID: string
    minWidth: number
    rowHeight: number
    header: ReactNode
    rows: readonly Row[]
    keyOf(row: Row): string
    renderRow(row: Row): ReactNode
    onNearEnd(): void
    // When it changes, the rows scroll so that this row is fully in view under the header.
    scrollToIndex?: number
}

// The rows scroller's offset and heights, kept for scrolling a row into view. Refs: only
// the scroll effect reads them, so measuring never renders.
function useScrollMetrics() {
    const metrics = useRef({ scrollY: 0, viewHeight: 0, headerHeight: 0 })
    return {
        metrics,
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            metrics.current.scrollY = event.nativeEvent.contentOffset.y
        },
        // True when this is the first measure of the view, so a row asked for before it
        // can scroll into view now.
        onViewLayout: (event: LayoutChangeEvent): boolean => {
            const isFirstMeasure = metrics.current.viewHeight <= 0
            metrics.current.viewHeight = event.nativeEvent.layout.height
            return isFirstMeasure
        },
        onHeaderLayout: (event: LayoutChangeEvent) => {
            metrics.current.headerHeight = event.nativeEvent.layout.height
        },
    }
}

type ScrollMetrics = ReturnType<typeof useScrollMetrics>['metrics']

// Scrolls the rows so that row `index` sits fully below the sticky header; nothing when no
// row is asked for, when it is in view, or while the view is not measured.
function scrollRowIntoView(input: {
    index: number | undefined
    rowHeight: number
    metrics: ScrollMetrics
    rowsScrollRef: RefObject<ScrollViewInstance | null>
}) {
    const { index, rowHeight, metrics, rowsScrollRef } = input
    if (index === undefined || index < 0) return
    const { scrollY, viewHeight, headerHeight } = metrics.current
    const y = scrollIntoViewY({
        top: headerHeight + index * rowHeight,
        bottom: headerHeight + (index + 1) * rowHeight,
        scrollY,
        viewHeight,
        cover: headerHeight,
    })
    if (y !== null) rowsScrollRef.current?.scrollTo({ y, animated: false })
}

// A windowed table: below `minWidth` it scrolls sideways, the header stays on top while the
// rows scroll under it, and nearing the end (or rows that fit the view) asks for the next
// page (`onNearEnd`).
export function ListTable<Row>({
    testID,
    minWidth,
    rowHeight,
    header,
    rows,
    keyOf,
    renderRow,
    onNearEnd,
    scrollToIndex,
}: ListTableProps<Row>) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({ total: rows.length, rowHeight, viewHeight, onNearEnd })
    const table = useTableMinWidth(minWidth)
    const { rowsScrollRef } = table
    const scroll = useScrollMetrics()
    const { metrics } = scroll
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map(row => <Fragment key={keyOf(row)}>{renderRow(row)}</Fragment>)
    const topSpacer = { height: rowWindow.topSpace }
    const bottomSpacer = { height: rowWindow.bottomSpace }
    const onRowsLayout = (event: LayoutChangeEvent) => {
        table.onRowsLayout()
        rowWindow.onViewLayout(event)
        const isFirstMeasure = scroll.onViewLayout(event)
        if (isFirstMeasure)
            scrollRowIntoView({ index: scrollToIndex, rowHeight, metrics, rowsScrollRef })
    }
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        scroll.onScroll(event)
        rowWindow.onScroll(event)
    }
    // An imperative scroll of the native scroller when the asked row changes: it moves the
    // view, it syncs no state. The header is the first, sticky child of the rows scroller,
    // so a row sits fully below it. A table that mounts with a row asked for (a resize from
    // phone cards to the table) is not measured yet; the rows layout scrolls it then.
    useEffect(() => {
        scrollRowIntoView({ index: scrollToIndex, rowHeight, metrics, rowsScrollRef })
    }, [scrollToIndex, rowHeight, metrics, rowsScrollRef])
    return (
        <ScrollView
            horizontal
            testID={testID}
            className="flex-1"
            contentContainerStyle={table.contentStyle}
        >
            <View className="flex-1">
                <ScrollView
                    testID={`${testID}-rows`}
                    ref={rowsScrollRef}
                    onLayout={onRowsLayout}
                    onContentSizeChange={rowWindow.onContentSizeChange}
                    className="flex-1 web:[scrollbar-gutter:stable]"
                    stickyHeaderIndices={[0]}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                >
                    <View onLayout={scroll.onHeaderLayout}>{header}</View>
                    <View>
                        <View style={topSpacer} />
                        {visible}
                        <View style={bottomSpacer} />
                    </View>
                </ScrollView>
            </View>
        </ScrollView>
    )
}

export function ListHeaderRow({ testID, children }: { testID: string; children: ReactNode }) {
    return (
        <View
            testID={testID}
            className={`${PARTY_ROW_CLASS} border-b border-border bg-background`}
            style={{ minHeight: 44 }}
        >
            {children}
        </View>
    )
}

const HEADER_TEXT_CLASS = 'text-xs font-semibold uppercase text-muted-foreground'

export function ListHeaderCell({
    label,
    style,
    align = 'left',
    testID,
}: {
    label: string
    style: ViewStyle
    align?: 'left' | 'right'
    testID?: string
}) {
    const alignClass = align === 'right' ? ' text-right' : ''
    return (
        <View testID={testID} className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`${HEADER_TEXT_CLASS}${alignClass}`}>
                {label}
            </Text>
        </View>
    )
}

function SortArrow({ sorted }: { sorted: 'ascending' | 'descending' | 'none' }) {
    const color = useThemeColor('muted-foreground')
    if (sorted === 'none') return null
    const Icon = sorted === 'ascending' ? ArrowUp : ArrowDown
    return <Icon size={14} color={color} />
}

const SORT_BUTTON_HEIGHT = { minHeight: 44 }

// The button's accessible name carries the order, because screen readers ignore
// `aria-sort` on a button.
function sortCellLabel(label: string, sorted: 'ascending' | 'descending' | 'none') {
    if (sorted === 'none') return `Sort by ${label}`
    return `${label}, sorted ${sorted}`
}

/**
 * A header cell that sorts its column: a button that states its order to assistive
 * technology (`aria-sort` and its name) and draws an arrow while its column is sorted.
 * The column's `style` goes on an outer View, as in `ListHeaderCell`, so its `alignItems`
 * places the button horizontally (a right column's label at the right edge); the button
 * is centered vertically in the 44 px header row like the plain cells.
 */
export function ListSortHeaderCell({
    label,
    style,
    align = 'left',
    testID,
    sorted,
    onPress,
}: {
    label: string
    style: ViewStyle
    align?: 'left' | 'right'
    testID: string
    sorted: 'ascending' | 'descending' | 'none'
    onPress(): void
}) {
    const justify = align === 'right' ? ' justify-end' : ''
    const accessibilityLabel = sortCellLabel(label, sorted)
    return (
        <View className="min-w-0 justify-center pr-3" style={style}>
            <Pressable
                testID={testID}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                aria-sort={sorted}
                onPress={onPress}
                className={`max-w-full flex-row items-center gap-1${justify}`}
                style={SORT_BUTTON_HEIGHT}
            >
                <Text numberOfLines={1} className={`shrink ${HEADER_TEXT_CLASS}`}>
                    {label}
                </Text>
                <SortArrow sorted={sorted} />
            </Pressable>
        </View>
    )
}
