import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface AllHiddenProps {
    isVisible: boolean
    onCustomize: () => void
    // Customize is not offered until the preference has loaded.
    isDisabled: boolean
}

// The page outside edit mode when every widget is hidden (spec §3 "Customize").
export function AllHidden({ isVisible, onCustomize, isDisabled }: AllHiddenProps) {
    if (!isVisible) return null
    return (
        <View testID="dashboard-all-hidden" className="items-start gap-3 py-6">
            <Text className="text-sm text-muted-foreground">All widgets are hidden.</Text>
            <Button
                testID="dashboard-all-hidden-customize"
                variant="outline"
                isDisabled={isDisabled}
                onPress={onCustomize}
            >
                <ButtonText>Customize</ButtonText>
            </Button>
        </View>
    )
}
