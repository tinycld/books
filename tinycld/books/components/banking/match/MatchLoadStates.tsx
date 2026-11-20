import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

// The loading and load-error states of the Match section, shared by the suggestions and
// the find mode: both read "Books could not load the matches." and retry every read of
// the section.

export function MatchLoading({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return (
        <View testID={testID} className="py-6">
            <LoadingState />
        </View>
    )
}

export function MatchLoadError({
    isVisible,
    onRetry,
}: {
    isVisible: boolean
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <View testID="bank-match-error" accessibilityRole="alert" className="items-start gap-3">
            <Text className="text-sm text-foreground">Books could not load the matches.</Text>
            <Button
                testID="bank-match-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}
