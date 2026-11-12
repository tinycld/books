import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { EntryBackLink } from '../entries/EntryHeader'
import { useDocumentKind } from './document-kind-context'

const TAP = { minHeight: 44 }

export function DocumentLoadError({ onRetry }: { onRetry(): void }) {
    const { doc } = useDocumentKind()
    const errorId = `${doc.testId}-error`
    const retryId = `${doc.testId}-retry`
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID={errorId}
                accessibilityRole="alert"
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">
                    {doc.messages.loadFailed}
                </Text>
                <Button testID={retryId} variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        </View>
    )
}
