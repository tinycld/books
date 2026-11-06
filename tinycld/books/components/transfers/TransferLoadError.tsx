import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

export function TransferLoadError({ onRetry }: { onRetry(): void }) {
    return (
        <View
            testID="transfer-error"
            accessibilityRole="alert"
            className="flex-1 items-center gap-3 bg-background p-6"
        >
            <Text className="text-base font-medium text-foreground">
                Books could not load this transfer.
            </Text>
            <Button
                testID="transfer-retry"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}
