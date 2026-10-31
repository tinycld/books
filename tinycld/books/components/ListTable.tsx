import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { Fragment, type ReactNode } from 'react'
import { ScrollView, Text, View, type ViewStyle } from 'react-native'
import { useRowWindow } from '../hooks/useRowWindow'
import { useTableMinWidth } from '../hooks/useTableMinWidth'
import { PARTY_ROW_CLASS } from '../lib/party-list'

type ListTableProps<Row> = {
    testID: string
    minWidth: number
    rowHeight: number
    header: ReactNode
    rows: readonly Row[]
    keyOf(row: Row): string
    renderRow(row: Row): ReactNode
}

// A windowed table: below `minWidth` it scrolls sideways, and the header stays on top
// while the rows scroll under it.
export function ListTable<Row>({
    testID,
    minWidth,
    rowHeight,
    header,
    rows,
    keyOf,
    renderRow,
}: ListTableProps<Row>) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({ total: rows.length, rowHeight, viewHeight })
    const table = useTableMinWidth(minWidth)
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map(row => <Fragment key={keyOf(row)}>{renderRow(row)}</Fragment>)
    const topSpacer = { height: rowWindow.topSpace }
    const bottomSpacer = { height: rowWindow.bottomSpace }
    return (
        <ScrollView
            horizontal
            testID={testID}
            className="flex-1"
            contentContainerStyle={table.contentStyle}
        >
            <View className="flex-1">
                <ScrollView
                    ref={table.rowsScrollRef}
                    onLayout={table.onRowsLayout}
                    className="flex-1 web:[scrollbar-gutter:stable]"
                    stickyHeaderIndices={[0]}
                    onScroll={rowWindow.onScroll}
                    scrollEventThrottle={16}
                >
                    {header}
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

export function ListHeaderCell({
    label,
    style,
    align = 'left',
}: {
    label: string
    style: ViewStyle
    align?: 'left' | 'right'
}) {
    const alignClass = align === 'right' ? ' text-right' : ''
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text
                numberOfLines={1}
                className={`text-xs font-semibold uppercase text-muted-foreground${alignClass}`}
            >
                {label}
            </Text>
        </View>
    )
}
