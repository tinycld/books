import { Button, ButtonText } from '@tinycld/core/ui/button'
import { View } from 'react-native'

// The Map columns step of a CSV file. Its questions, the sample and the preview come in
// checkpoint 2; until then Continue cannot be pressed.
export function MapColumnsStep({ onCancel }: { onCancel: () => void }) {
    return (
        <View testID="bank-import-map" className="flex-row justify-end gap-2">
            <Button
                testID="bank-import-cancel"
                variant="outline"
                className="min-h-11"
                onPress={onCancel}
            >
                <ButtonText>Cancel</ButtonText>
            </Button>
            <Button testID="bank-import-continue" className="min-h-11" isDisabled>
                <ButtonText>Continue</ButtonText>
            </Button>
        </View>
    )
}
