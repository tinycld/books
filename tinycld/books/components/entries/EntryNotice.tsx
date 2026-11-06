import { Text, View } from 'react-native'
import { EntryBackLink } from './EntryHeader'

// A one-line notice in place of an entry or transfer screen, with the back link.
export function EntryNotice({ testID, message }: { testID: string; message: string }) {
    return (
        <View testID={testID} className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">{message}</Text>
        </View>
    )
}
