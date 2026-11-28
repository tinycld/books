import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

const TAP = { minHeight: 44 }

interface StockReadErrorProps {
    isVisible: boolean
    message: string
    onRetry: () => void
    testID: string
}

// A read of the item page that failed: its text and Retry, in place.
export function StockReadError({ isVisible, message, onRetry, testID }: StockReadErrorProps) {
    if (!isVisible) return null
    return (
        <View
            testID={testID}
            accessibilityRole="alert"
            className="flex-row flex-wrap items-center gap-2"
        >
            <Text className="text-sm text-danger">{message}</Text>
            <Button variant="outline" size="sm" style={TAP} onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}
