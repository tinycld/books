import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ActivityIndicator, Text, View } from 'react-native'
import { PublicCardSurface } from './PublicFrame'

const TAP = { minHeight: 44 }

// The state views of a customer's page (estimate, invoice). Each page passes its test id
// stem ("estimate-public") and its own texts.

export function PublicLoading({
    isVisible,
    testIdPrefix,
    text,
}: {
    isVisible: boolean
    testIdPrefix: string
    text: string
}) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <PublicCardSurface testID={`${testIdPrefix}-loading`}>
            <View className="items-center gap-3 py-6">
                <ActivityIndicator size="small" color={color} />
                <Text className="text-sm text-muted-foreground">{text}</Text>
            </View>
        </PublicCardSurface>
    )
}

// Nothing is known about a link no row has, so no business name shows.
export function PublicNotFound({
    isVisible,
    testIdPrefix,
    title,
    hint,
}: {
    isVisible: boolean
    testIdPrefix: string
    title: string
    hint: string
}) {
    if (!isVisible) return null
    return (
        <PublicCardSurface testID={`${testIdPrefix}-not-found`}>
            <View className="items-center gap-2 py-4">
                <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
                <Text className="text-center text-sm text-muted-foreground">{hint}</Text>
            </View>
        </PublicCardSurface>
    )
}

export function PublicLoadError({
    isVisible,
    testIdPrefix,
    message,
    retryLabel,
    onRetry,
}: {
    isVisible: boolean
    testIdPrefix: string
    message: string
    retryLabel: string
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <PublicCardSurface testID={`${testIdPrefix}-error`}>
            <View accessibilityRole="alert" className="items-center gap-3 py-4">
                <Text className="text-center text-base font-medium text-foreground">{message}</Text>
                <Button
                    testID={`${testIdPrefix}-retry`}
                    variant="outline"
                    style={TAP}
                    onPress={onRetry}
                >
                    <ButtonText>{retryLabel}</ButtonText>
                </Button>
            </View>
        </PublicCardSurface>
    )
}
