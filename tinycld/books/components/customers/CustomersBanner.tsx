import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { X } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

interface CustomersBannerProps {
    message: string | null
    onRetry?: () => void
    onDismiss?: () => void
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
    if (!onRetry) return null
    return (
        <Button
            testID="customers-retry"
            variant="outline"
            size="sm"
            style={{ minHeight: 44 }}
            onPress={onRetry}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

function DismissButton({ onDismiss }: { onDismiss?: () => void }) {
    const color = useThemeColor('danger')
    if (!onDismiss) return null
    return (
        <Pressable
            testID="customers-banner-dismiss"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onDismiss}
            className="items-center justify-center"
            style={{ width: 44, height: 44 }}
        >
            <X size={16} color={color} />
        </Pressable>
    )
}

export function CustomersBanner({ message, onRetry, onDismiss }: CustomersBannerProps) {
    if (message === null) return null
    return (
        <View
            testID="customers-banner"
            accessibilityRole="alert"
            className="mx-4 mb-3 flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">{message}</Text>
            <RetryButton onRetry={onRetry} />
            <DismissButton onDismiss={onDismiss} />
        </View>
    )
}
