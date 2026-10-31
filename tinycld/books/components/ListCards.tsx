import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { Fragment, type ReactNode, useMemo } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { useRowWindow } from '../hooks/useRowWindow'
import { useFabClearanceStyle } from '../lib/fab-clearance'

type ListCardsProps<Row> = {
    testID: string
    rows: readonly Row[]
    // Must be a module-level function: it is a memo dependency.
    heightOf(row: Row, fontScale: number): number
    keyOf(row: Row): string
    renderCard(row: Row, height: number): ReactNode
    onNearEnd(): void
}

// A windowed card list for phones: every card is drawn at the height `heightOf` gives it,
// and nearing the end asks for the next page (`onNearEnd`).
export function ListCards<Row>({
    testID,
    rows,
    heightOf,
    keyOf,
    renderCard,
    onNearEnd,
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
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map((row, offset) => (
            <Fragment key={keyOf(row)}>
                {renderCard(row, heights[rowWindow.first + offset])}
            </Fragment>
        ))
    const topSpacer = { height: rowWindow.topSpace }
    const bottomSpacer = { height: rowWindow.bottomSpace }
    return (
        <ScrollView
            testID={testID}
            className="flex-1"
            contentContainerStyle={fabClearanceStyle}
            onScroll={rowWindow.onScroll}
            scrollEventThrottle={16}
        >
            <View style={topSpacer} />
            {visible}
            <View style={bottomSpacer} />
        </ScrollView>
    )
}
