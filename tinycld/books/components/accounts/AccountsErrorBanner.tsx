import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { X } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

interface AccountsErrorBannerProps {
    message: string | null
    onDismiss: () => void
}

export function AccountsErrorBanner({ message, onDismiss }: AccountsErrorBannerProps) {
    const color = useThemeColor('danger')
    if (!message) return null
    return (
        <View
            testID="accounts-action-error"
            accessibilityRole="alert"
            className="mx-4 mb-3 flex-row items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">{message}</Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={onDismiss}
                className="items-center justify-center"
                style={{ width: 44, height: 44 }}
            >
                <X size={16} color={color} />
            </Pressable>
        </View>
    )
}
