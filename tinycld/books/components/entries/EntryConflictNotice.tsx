import { View } from 'react-native'
import { REVISION_CONFLICT_REOPEN_TEXT, REVISION_CONFLICT_TEXT } from '../../lib/revision'
import { ConflictNotice } from '../ConflictNotice'

interface Props {
    isVisible: boolean
    // Absent on a form with no stored draft of its own route (a new entry, a correction):
    // the person opens the draft again from the list.
    onReload?: () => void | Promise<void>
}

// The entry form's conflict notice, in the form's own padding.
export function EntryConflictNotice({ isVisible, onReload }: Props) {
    if (!isVisible) return null
    const text = onReload ? REVISION_CONFLICT_TEXT : REVISION_CONFLICT_REOPEN_TEXT
    return (
        <View className="px-4 pt-3">
            <ConflictNotice
                isVisible
                text={text}
                actionLabel="Load the current entry"
                testID="entry-conflict"
                onReload={onReload}
            />
        </View>
    )
}
