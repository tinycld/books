import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { EntryBackLink } from '../entries/EntryHeader'

interface DocumentNoticeProps {
    testID: string
    message: string
    // The screen's own back link; the entry screens' back link when not given.
    backLink?: ReactNode
}

// A one-line notice in place of the document screen (no access, not found, cannot be
// edited), with the back link.
export function DocumentNotice({ testID, message, backLink }: DocumentNoticeProps) {
    const back = backLink ?? <EntryBackLink />
    return (
        <View testID={testID} className="flex-1 gap-2 bg-background px-4 pt-2">
            {back}
            <Text className="text-base text-foreground">{message}</Text>
        </View>
    )
}
