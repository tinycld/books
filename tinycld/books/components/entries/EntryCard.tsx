import { Pressable, Text, View } from 'react-native'
import { entryNumberText, entryTotalText, entryTypeText } from '../../lib/entry-display'
import { formatDay } from '../../lib/register-range'
import { spaceOpens } from '../accounts/AccountRow'
import { type EntryItemProps, ReversesNumber, RowMenuSlot } from './EntryRow'
import { EntryStatusBadge } from './EntryStatusBadge'

export const ENTRY_CARD_HEIGHT = 96

export function EntryCard({ entry, currency, onOpenEntry, rowMenu }: EntryItemProps) {
    // A reversal card has the extra "Reverses JE-n" line; a one-line memo keeps it inside the fixed height.
    const memoLines = entry.reverses ? 1 : 2
    return (
        <Pressable
            testID={`entries-card-${entry.id}`}
            // Not a button: the card menu inside it is a button, and buttons cannot nest.
            role="row"
            onPress={() => onOpenEntry(entry.id)}
            {...spaceOpens(entry.id, onOpenEntry)}
            className="flex-row gap-3 overflow-hidden border-b border-border bg-background px-4 py-2"
            style={{ height: ENTRY_CARD_HEIGHT }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                    <Text
                        testID={`entries-cell-date-${entry.id}`}
                        className="text-xs text-muted-foreground"
                    >
                        {formatDay(entry.date)}
                    </Text>
                    <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                        {entryNumberText(entry)}
                    </Text>
                </View>
                <Text numberOfLines={memoLines} className="text-sm font-medium text-foreground">
                    {entry.memo}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {entryTypeText(entry.origin)}
                </Text>
                <ReversesNumber
                    entryId={entry.reverses}
                    className="text-xs text-muted-foreground"
                />
            </View>
            <View className="shrink-0 items-end justify-between">
                <EntryStatusBadge entryId={entry.id} status={entry.status} />
                <Text className="text-right text-sm font-medium text-foreground">
                    {entryTotalText(entry, currency)}
                </Text>
            </View>
            <RowMenuSlot entryId={entry.id} rowMenu={rowMenu} />
        </Pressable>
    )
}
