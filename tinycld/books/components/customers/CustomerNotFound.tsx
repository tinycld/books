import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

// An unknown id, or a customer deleted while it was open (by another user or tab).
export function CustomerNotFound({ onLeave }: { onLeave: () => void }) {
    return (
        <View testID="customer-not-found" className="flex-1 items-center justify-center gap-4 p-8">
            <Text className="text-center text-base text-foreground">
                This customer doesn't exist or was removed
            </Text>
            <Button testID="customer-not-found-back" variant="outline" onPress={onLeave}>
                <ButtonText>Back to customers</ButtonText>
            </Button>
        </View>
    )
}
