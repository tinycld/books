import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { X } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

interface ListBannerProps {
    testIdPrefix: string
    message: string | null
    onRetry?: () => void
    onDismiss?: () => void
}

function RetryButton({ testIdPrefix, onRetry }: Pick<ListBannerProps, 'testIdPrefix' | 'onRetry'>) {
    if (!onRetry) return null
    return (
        <Button
            testID={`${testIdPrefix}-retry`}
            variant="outline"
            size="sm"
            style={{ minHeight: 44 }}
            onPress={onRetry}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

function DismissButton({
    testIdPrefix,
    onDismiss,
}: Pick<ListBannerProps, 'testIdPrefix' | 'onDismiss'>) {
    const color = useThemeColor('danger')
    if (!onDismiss) return null
    return (
        <Pressable
            testID={`${testIdPrefix}-banner-dismiss`}
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

export function ListBanner({ testIdPrefix, message, onRetry, onDismiss }: ListBannerProps) {
    if (message === null) return null
    return (
        <View
            testID={`${testIdPrefix}-banner`}
            accessibilityRole="alert"
            className="mx-4 mb-3 flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">{message}</Text>
            <RetryButton testIdPrefix={testIdPrefix} onRetry={onRetry} />
            <DismissButton testIdPrefix={testIdPrefix} onDismiss={onDismiss} />
        </View>
    )
}
