import { Pressable, Text, View } from 'react-native'
import { REVISION_CONFLICT_TEXT } from '../../lib/revision'

interface Props {
    isVisible: boolean
    onReload(): void
}

// Shown when a save or a post was refused because another session changed the draft.
// Loading the current entry replaces what is typed here, so it is the person's choice.
export function EntryConflictNotice({ isVisible, onReload }: Props) {
    if (!isVisible) return null
    return (
        <View className="px-4 pt-3">
            <View
                testID="entry-conflict"
                accessibilityRole="alert"
                className="gap-2 rounded-md border border-border bg-muted p-3"
            >
                <Text className="text-sm text-foreground">{REVISION_CONFLICT_TEXT}</Text>
                <Pressable
                    testID="entry-conflict-reload"
                    accessibilityRole="button"
                    onPress={onReload}
                    className="self-start"
                    style={{ minHeight: 44, justifyContent: 'center' }}
                >
                    <Text className="text-sm font-medium text-primary">Load the current entry</Text>
                </Pressable>
            </View>
        </View>
    )
}
