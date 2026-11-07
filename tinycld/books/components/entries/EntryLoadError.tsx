import { View } from 'react-native'
import { ListBanner } from '../ListBanner'
import { EntryBackLink } from './EntryHeader'

const ENTRY_LOAD_ERROR = 'Books could not load this entry.'

// An entry screen whose lines, their names, the accounts or the access row did not load:
// the error and its Retry stand in place of the entry, under the back link.
export function EntryLoadError({ onRetry }: { onRetry(): void }) {
    return (
        <View testID="entry-read-load-error" className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <ListBanner
                testIdPrefix="entry-read"
                message={ENTRY_LOAD_ERROR}
                onRetry={onRetry}
                isFlush
            />
        </View>
    )
}
