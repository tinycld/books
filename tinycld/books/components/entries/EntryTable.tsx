import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { ScrollView, Text, View } from 'react-native'
import { ROW_OVERSCAN, useRowWindow } from '../../hooks/useRowWindow'
import {
    ENTRY_COLUMNS,
    ENTRY_MENU_WIDTH,
    ENTRY_ROW_CLASS,
    ENTRY_ROW_HEIGHT,
    type EntryListItem,
    EntryRow,
} from './EntryRow'

// Below this width the table scrolls sideways; no column collapses to blank.
const TABLE_MIN_WIDTH = 760

interface EntryTableProps {
    entries: EntryListItem[]
    currency: string
    onOpenEntry: (entryId: string) => void
    onNearEnd: () => void
    rowMenu?: (entryId: string) => ReactNode
}

function HeadingText({ label }: { label: string }) {
    return <Text className="text-xs font-semibold uppercase text-muted-foreground">{label}</Text>
}

// The row class adds a flex gap, so the trailing menu spacer must not exist without a menu:
// a zero-width spacer still adds a gap and shifts Status and Total off their cells.
function HeadingRow({ hasMenu }: { hasMenu: boolean }) {
    return (
        <View className={`${ENTRY_ROW_CLASS} bg-background`}>
            <View style={ENTRY_COLUMNS.date}>
                <HeadingText label="Date" />
            </View>
            <View style={ENTRY_COLUMNS.number}>
                <HeadingText label="No." />
            </View>
            <View style={ENTRY_COLUMNS.type}>
                <HeadingText label="Type" />
            </View>
            <View style={ENTRY_COLUMNS.memo}>
                <HeadingText label="Memo" />
            </View>
            <View style={ENTRY_COLUMNS.status}>
                <HeadingText label="Status" />
            </View>
            <View className="items-end" style={ENTRY_COLUMNS.total}>
                <HeadingText label="Total" />
            </View>
            {hasMenu ? <View style={{ width: ENTRY_MENU_WIDTH }} /> : null}
        </View>
    )
}

export function EntryTable({
    entries,
    currency,
    onOpenEntry,
    onNearEnd,
    rowMenu,
}: EntryTableProps) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: entries.length,
        rowHeight: ENTRY_ROW_HEIGHT,
        viewHeight,
    })
    const visible = entries
        .slice(rowWindow.first, rowWindow.last)
        .map(entry => (
            <EntryRow
                key={entry.id}
                entry={entry}
                currency={currency}
                onOpenEntry={onOpenEntry}
                rowMenu={rowMenu}
            />
        ))
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        rowWindow.onScroll(event)
        const { contentOffset, layoutMeasurement } = event.nativeEvent
        const lastShown = (contentOffset.y + layoutMeasurement.height) / ENTRY_ROW_HEIGHT
        if (lastShown + ROW_OVERSCAN >= entries.length) onNearEnd()
    }
    return (
        <ScrollView
            horizontal
            testID="entries-table"
            className="flex-1"
            contentContainerStyle={{ width: '100%', minWidth: TABLE_MIN_WIDTH }}
        >
            <View className="flex-1">
                <ScrollView
                    className="flex-1 web:[scrollbar-gutter:stable]"
                    stickyHeaderIndices={[0]}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                >
                    <HeadingRow hasMenu={rowMenu !== undefined} />
                    <View>
                        <View style={{ height: rowWindow.topSpace }} />
                        {visible}
                        <View style={{ height: rowWindow.bottomSpace }} />
                    </View>
                </ScrollView>
            </View>
        </ScrollView>
    )
}
