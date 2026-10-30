import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface RecordNotFoundProps {
    testIdPrefix: string
    message: string
    backLabel: string
    onLeave: () => void
}

// An unknown id, or a record deleted while it was open (by another user or tab).
export function RecordNotFound({ testIdPrefix, message, backLabel, onLeave }: RecordNotFoundProps) {
    return (
        <View
            testID={`${testIdPrefix}-not-found`}
            className="flex-1 items-center justify-center gap-4 p-8"
        >
            <Text className="text-center text-base text-foreground">{message}</Text>
            <Button testID={`${testIdPrefix}-not-found-back`} variant="outline" onPress={onLeave}>
                <ButtonText>{backLabel}</ButtonText>
            </Button>
        </View>
    )
}
