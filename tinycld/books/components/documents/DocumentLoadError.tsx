import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { EntryBackLink } from '../entries/EntryHeader'
import { useDocumentKind } from './document-kind-context'

const TAP = { minHeight: 44 }

interface LoadErrorPageProps {
    message: string
    onRetry(): void
    // The alert's test id; the Retry button's is `retryTestID`.
    testID: string
    retryTestID: string
}

// A failed read of a record screen with Retry, kind-free: a document screen and a page that
// is no document kind (the write-off page) draw it with their own text and test ids.
export function LoadErrorPage({ message, onRetry, testID, retryTestID }: LoadErrorPageProps) {
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID={testID}
                accessibilityRole="alert"
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <Button testID={retryTestID} variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        </View>
    )
}

// `message` names what failed: the document, or only a read its form needs (a sales
// receipt's deposit accounts).
export function DocumentLoadError({ message, onRetry }: { message: string; onRetry(): void }) {
    const { doc } = useDocumentKind()
    return (
        <LoadErrorPage
            message={message}
            onRetry={onRetry}
            testID={`${doc.testId}-error`}
            retryTestID={`${doc.testId}-retry`}
        />
    )
}
