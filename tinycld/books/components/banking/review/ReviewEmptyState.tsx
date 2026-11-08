import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

type EmptyAction = { label: string; onPress: () => void }

function EmptyActionButton({ action }: { action: EmptyAction | null }) {
    if (!action) return null
    return (
        <Button
            testID="bank-review-empty-action"
            variant="outline"
            className="min-h-11"
            onPress={action.onPress}
        >
            <ButtonText>{action.label}</ButtonText>
        </Button>
    )
}

// A tab with no rows to show: its sentence, and an action only where the user can act,
// centered in the tab body.
export function ReviewEmptyState({ text, action }: { text: string; action: EmptyAction | null }) {
    return (
        <View
            testID="bank-review-empty"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-sm text-muted-foreground">{text}</Text>
            <EmptyActionButton action={action} />
        </View>
    )
}

// The tab bar stays while a tab's list fails to load; only the tab body shows the error.
export function ReviewLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="bank-review-error"
            accessibilityRole="alert"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-base font-medium text-foreground">
                Books could not load these transactions.
            </Text>
            <Button
                testID="bank-review-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

export function ReviewLoading() {
    return (
        <View testID="bank-review-loading" className="flex-1 items-center justify-center">
            <LoadingState />
        </View>
    )
}
