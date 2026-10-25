import { Text, View } from 'react-native'
import { entryStatusText } from '../../lib/entry-display'
import type { BooksJournalEntries } from '../../types'

type Status = BooksJournalEntries['status']

const BORDER: Record<Status, string> = {
    draft: 'border-border',
    posted: 'border-success',
    void: 'border-destructive',
}

const TEXT: Record<Status, string> = {
    draft: 'text-muted-foreground',
    posted: 'text-success',
    void: 'text-destructive',
}

export function EntryStatusBadge({ entryId, status }: { entryId?: string; status: Status }) {
    return (
        <View className={`rounded-full border px-2 py-0.5 ${BORDER[status]}`}>
            <Text
                testID={entryId ? `entries-status-${entryId}` : undefined}
                className={`text-xs ${TEXT[status]}`}
            >
                {entryStatusText(status)}
            </Text>
        </View>
    )
}
