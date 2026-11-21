import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { EntryBackLink } from './EntryHeader'

const TAP = { minHeight: 44 }

interface EntryNoticeProps {
    testID: string
    message: string
    // The screen's own back link; the entry screens' back link when not given.
    back?: ReactNode
    // A title over the message (the screen's own title).
    title?: string
    // A Retry button under the message, when given (a read that failed).
    retry?: NoticeRetryProps
}

interface NoticeRetryProps {
    testID: string
    onPress: () => void
}

function NoticeTitle({ title }: { title?: string }) {
    if (!title) return null
    return <Text className="text-xl font-semibold text-foreground">{title}</Text>
}

function NoticeRetry({ retry }: { retry?: NoticeRetryProps }) {
    if (!retry) return null
    return (
        <Button
            testID={retry.testID}
            variant="outline"
            className="self-start"
            style={TAP}
            onPress={retry.onPress}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

// A one-line notice in place of a Books screen (an entry, a transfer, Create statements),
// with the back link.
export function EntryNotice({ testID, message, back, title, retry }: EntryNoticeProps) {
    const backLink = back ?? <EntryBackLink />
    return (
        <View testID={testID} className="flex-1 gap-2 bg-background px-4 pt-2">
            {backLink}
            <NoticeTitle title={title} />
            <Text className="text-base text-foreground">{message}</Text>
            <NoticeRetry retry={retry} />
        </View>
    )
}
