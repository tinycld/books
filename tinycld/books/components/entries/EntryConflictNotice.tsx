import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { REVISION_CONFLICT_REOPEN_TEXT, REVISION_CONFLICT_TEXT } from '../../lib/revision'

interface Props {
    isVisible: boolean
    // Absent on a form with no stored draft of its own route (a new entry, a correction):
    // the person opens the draft again from the list.
    onReload?: () => void
}

function ReloadButton({ onReload }: Pick<Props, 'onReload'>) {
    if (!onReload) return null
    return (
        <Button
            testID="entry-conflict-reload"
            variant="outline"
            size="sm"
            className="self-start"
            style={{ minHeight: 44 }}
            onPress={onReload}
        >
            <ButtonText>Load the current entry</ButtonText>
        </Button>
    )
}

// Shown when a save or a post was refused because another session changed the draft.
// Loading the current entry replaces what is typed here, so it is the person's choice.
export function EntryConflictNotice({ isVisible, onReload }: Props) {
    if (!isVisible) return null
    const text = onReload ? REVISION_CONFLICT_TEXT : REVISION_CONFLICT_REOPEN_TEXT
    return (
        <View className="px-4 pt-3">
            <View
                testID="entry-conflict"
                accessibilityRole="alert"
                className="gap-2 rounded-md border border-border bg-muted p-3"
            >
                <Text className="text-sm text-foreground">{text}</Text>
                <ReloadButton onReload={onReload} />
            </View>
        </View>
    )
}
