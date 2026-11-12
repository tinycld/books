import { Text, View } from 'react-native'
import { EntryBackLink } from '../entries/EntryHeader'

// A one-line notice in place of the document screen (no access, not found, cannot be
// edited), with the back link.
export function DocumentNotice({ testID, message }: { testID: string; message: string }) {
    return (
        <View testID={testID} className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">{message}</Text>
        </View>
    )
}
