import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

export function BankingLoading() {
    return (
        <View testID="bank-loading" className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}

export function BankingLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="bank-error"
            accessibilityRole="alert"
            className="flex-1 items-center gap-3 bg-background p-6"
        >
            <Text className="text-base font-medium text-foreground">
                Books could not load your bank accounts.
            </Text>
            <Button
                testID="bank-retry"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}
