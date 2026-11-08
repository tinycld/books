import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { Fragment, type ReactNode, type RefObject, useEffect, useMemo, useRef } from 'react'
import {
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    ScrollView,
    type ScrollViewInstance,
    useWindowDimensions,
    View,
} from 'react-native'
import { useRowWindow } from '../hooks/useRowWindow'
import { useFabClearanceStyle } from '../lib/fab-clearance'
import { scrollIntoViewY } from '../lib/scroll-into-view'

type ListCardsProps<Row> = {
    testID: string
    rows: readonly Row[]
    // Must be a module-level function: it is a memo dependency.
    heightOf(row: Row, fontScale: number): number
    keyOf(row: Row): string
    renderCard(row: Row, height: number): ReactNode
    onNearEnd(): void
    // When it changes, the list scrolls so that this card is fully in view.
    scrollToIndex?: number
}

function sumBefore(heights: readonly number[], index: number): number {
    return heights.slice(0, index).reduce((sum, height) => sum + height, 0)
}

// Scrolls the list so that card `index` is fully in view; nothing when no card is asked
// for, when it is in view, or while the view is not measured.
function scrollCardIntoView(input: {
    index: number | undefined
    heights: readonly number[]
    metrics: { scrollY: number; viewHeight: number }
    scrollRef: RefObject<ScrollViewInstance | null>
}) {
    const { index, heights, metrics, scrollRef } = input
    if (index === undefined || index < 0 || index >= heights.length) return
    const top = sumBefore(heights, index)
    const y = scrollIntoViewY({
        top,
        bottom: top + heights[index],
        scrollY: metrics.scrollY,
        viewHeight: metrics.viewHeight,
        cover: 0,
    })
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: false })
}

// A windowed card list for phones: every card is drawn at the height `heightOf` gives it,
// and nearing the end (or cards that fit the view) asks for the next page (`onNearEnd`).
export function ListCards<Row>({
    testID,
    rows,
    heightOf,
    keyOf,
    renderCard,
    onNearEnd,
    scrollToIndex,
}: ListCardsProps<Row>) {
    const fabClearanceStyle = useFabClearanceStyle()
    const viewHeight = useWindowHeight()
    // Reactive, so a change of the system text size while the list is open re-sizes the cards
    // (the window keeps its first row, so the view settles on the next scroll).
    const { fontScale } = useWindowDimensions()
    // Scrolling re-renders this list; the heights change only with the rows or the font scale.
    const heights = useMemo(
        () => rows.map(row => heightOf(row, fontScale)),
        [rows, heightOf, fontScale]
    )
    const rowWindow = useRowWindow({ total: heights.length, heights, viewHeight, onNearEnd })
    const scrollRef = useRef<ScrollViewInstance>(null)
    // The scroller's offset and height, read only by the scroll effect, so refs.
    const metrics = useRef({ scrollY: 0, viewHeight: 0 })
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map((row, offset) => (
            <Fragment key={keyOf(row)}>
                {renderCard(row, heights[rowWindow.first + offset])}
            </Fragment>
        ))
    const topSpacer = { height: rowWindow.topSpace }
    const bottomSpacer = { height: rowWindow.bottomSpace }
    // A list that mounts with a card asked for (a resize from the table to phone cards) is
    // not measured yet, so its first measure scrolls that card into view.
    const onLayout = (event: LayoutChangeEvent) => {
        const isFirstMeasure = metrics.current.viewHeight <= 0
        metrics.current.viewHeight = event.nativeEvent.layout.height
        rowWindow.onViewLayout(event)
        if (isFirstMeasure) {
            scrollCardIntoView({
                index: scrollToIndex,
                heights,
                metrics: metrics.current,
                scrollRef,
            })
        }
    }
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        metrics.current.scrollY = event.nativeEvent.contentOffset.y
        rowWindow.onScroll(event)
    }
    // An imperative scroll of the native scroller when the asked card changes: it moves the
    // view, it syncs no state. The heights are read through a ref, so a change of the rows
    // alone does not scroll the list back to the focused card.
    const heightsRef = useRef(heights)
    heightsRef.current = heights
    useEffect(() => {
        scrollCardIntoView({
            index: scrollToIndex,
            heights: heightsRef.current,
            metrics: metrics.current,
            scrollRef,
        })
    }, [scrollToIndex])
    return (
        <ScrollView
            ref={scrollRef}
            testID={testID}
            className="flex-1"
            contentContainerStyle={fabClearanceStyle}
            onLayout={onLayout}
            onContentSizeChange={rowWindow.onContentSizeChange}
            onScroll={onScroll}
            scrollEventThrottle={16}
        >
            <View style={topSpacer} />
            {visible}
            <View style={bottomSpacer} />
        </ScrollView>
    )
}
