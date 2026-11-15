import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ActivityIndicator, Text, View } from 'react-native'
import { PUBLIC_TEXTS } from '../../lib/estimate-public'
import { PublicCardSurface } from './PublicEstimateFrame'

const TAP = { minHeight: 44 }

export function PublicLoading({ isVisible }: { isVisible: boolean }) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <PublicCardSurface testID="estimate-public-loading">
            <View className="items-center gap-3 py-6">
                <ActivityIndicator size="small" color={color} />
                <Text className="text-sm text-muted-foreground">{PUBLIC_TEXTS.loading}</Text>
            </View>
        </PublicCardSurface>
    )
}

// Nothing is known about a link no row has, so no business name shows.
export function PublicNotFound({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <PublicCardSurface testID="estimate-public-not-found">
            <View className="items-center gap-2 py-4">
                <Text className="text-center text-lg font-semibold text-foreground">
                    {PUBLIC_TEXTS.notFound}
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                    {PUBLIC_TEXTS.notFoundHint}
                </Text>
            </View>
        </PublicCardSurface>
    )
}

export function PublicLoadError({
    isVisible,
    onRetry,
}: {
    isVisible: boolean
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <PublicCardSurface testID="estimate-public-error">
            <View accessibilityRole="alert" className="items-center gap-3 py-4">
                <Text className="text-center text-base font-medium text-foreground">
                    {PUBLIC_TEXTS.loadError}
                </Text>
                <Button
                    testID="estimate-public-retry"
                    variant="outline"
                    style={TAP}
                    onPress={onRetry}
                >
                    <ButtonText>{PUBLIC_TEXTS.retry}</ButtonText>
                </Button>
            </View>
        </PublicCardSurface>
    )
}
