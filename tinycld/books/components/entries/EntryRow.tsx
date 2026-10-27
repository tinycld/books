import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type ReactNode, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { useEntriesQuery } from '../../hooks/useEntriesQuery'
import {
    entryNumberText,
    entryTotalText,
    entryTypeText,
    reversesText,
} from '../../lib/entry-display'
import { formatDay } from '../../lib/register-range'
import { spaceOpens } from '../accounts/AccountRow'
import { EntryStatusBadge } from './EntryStatusBadge'

export type EntryListItem = NonNullable<ReturnType<typeof useEntriesQuery>['entries']>[number]

// Header and rows share these; Memo takes the free space and Total never shrinks.
export const ENTRY_COLUMNS = {
    date: { width: 100, flexShrink: 0 },
    number: { width: 90, flexShrink: 0 },
    type: { width: 150, flexShrink: 1, minWidth: 90 },
    memo: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 120 },
    status: { width: 90, flexShrink: 0 },
    total: { width: 116, flexShrink: 0 },
} as const

export const ENTRY_ROW_HEIGHT = 44
export const ENTRY_MENU_WIDTH = 44
export const ENTRY_ROW_CLASS = 'flex-row items-center gap-2 border-b border-border px-4'

export interface EntryItemProps {
    entry: EntryListItem
    currency: string
    onOpenEntry: (entryId: string) => void
    rowMenu?: (entryId: string) => ReactNode
}

// A reversal names the entry it reverses; that entry is read from the store, one per visible row.
// useRecord cannot tell a missing record from one not loaded yet, so this reads isReady itself.
export function ReversesNumber({ entryId, className }: { entryId: string; className: string }) {
    const [entriesCollection] = useStore('books_journal_entries')
    const { data: reversed, isReady } = useLiveQuery({
        // An explicit key: this runs once per visible row, so rebuilding the IR identity on
        // every render adds up.
        queryKey: ['books.entries.reverses', entryId],
        query: q =>
            entryId
                ? q
                      .from({ r: entriesCollection })
                      .where(({ r }) => eq(r.id, entryId))
                      .findOne()
                : null,
    })
    const isMissing = entryId !== '' && isReady && !reversed
    // Logging is the only effect; the placeholder text shows meanwhile.
    useEffect(() => {
        if (isMissing) log.warn('books.entries', 'reversed entry not found', { entryId })
    }, [isMissing, entryId])
    if (entryId === '') return null
    return (
        <Text numberOfLines={1} className={className}>
            {reversesText(reversed?.number)}
        </Text>
    )
}

// The menu sits inside a responder boundary so a press on it never reaches the row.
export function RowMenuSlot({
    entryId,
    rowMenu,
}: Pick<EntryItemProps, 'rowMenu'> & { entryId: string }) {
    if (!rowMenu) return null
    return (
        <View
            onStartShouldSetResponder={() => true}
            className="items-center justify-center"
            style={{ width: ENTRY_MENU_WIDTH, minHeight: ENTRY_ROW_HEIGHT }}
        >
            {rowMenu(entryId)}
        </View>
    )
}

export function EntryRow({ entry, currency, onOpenEntry, rowMenu }: EntryItemProps) {
    const cellId = (column: string) => `entries-cell-${column}-${entry.id}`
    return (
        <Pressable
            testID={`entries-row-${entry.id}`}
            // Not a button: the row menu inside it is a button, and buttons cannot nest.
            role="row"
            onPress={() => onOpenEntry(entry.id)}
            {...spaceOpens(entry.id, onOpenEntry)}
            className={`${ENTRY_ROW_CLASS} bg-background`}
            style={{ minHeight: ENTRY_ROW_HEIGHT }}
        >
            <View testID={cellId('date')} style={ENTRY_COLUMNS.date}>
                <Text className="text-sm text-foreground">{formatDay(entry.date)}</Text>
            </View>
            <View testID={cellId('number')} style={ENTRY_COLUMNS.number}>
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                    {entryNumberText(entry)}
                </Text>
            </View>
            <View testID={cellId('type')} className="min-w-0" style={ENTRY_COLUMNS.type}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {entryTypeText(entry.origin)}
                </Text>
                <ReversesNumber
                    entryId={entry.reverses}
                    className="text-xs text-muted-foreground"
                />
            </View>
            <View testID={cellId('memo')} className="min-w-0" style={ENTRY_COLUMNS.memo}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {entry.memo}
                </Text>
            </View>
            <View testID={cellId('status')} className="items-start" style={ENTRY_COLUMNS.status}>
                <EntryStatusBadge entryId={entry.id} status={entry.status} />
            </View>
            <View testID={cellId('total')} className="items-end" style={ENTRY_COLUMNS.total}>
                <Text className="text-right text-sm font-medium text-foreground">
                    {entryTotalText(entry, currency)}
                </Text>
            </View>
            <RowMenuSlot entryId={entry.id} rowMenu={rowMenu} />
        </Pressable>
    )
}
