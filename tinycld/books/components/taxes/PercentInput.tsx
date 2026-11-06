import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type Control, useController } from '@tinycld/core/ui/form'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import { TextInput as RNTextInput, Text, View } from 'react-native'
import type { RateValues } from '../../lib/tax-schemas'

interface PercentInputProps {
    control: Control<RateValues>
    name: 'rate'
    label: string
    testID: string
}

function FieldError({ message }: { message: string | undefined }) {
    if (!message) return null
    return <Text className="text-xs text-danger">{message}</Text>
}

// The rate as typed text with a "%" inside the box. Core TextInput's addon draws beside
// the box, so the sign is an overlay sized to the input's height, as in MoneyInput.
export function PercentInput({ control, name, label, testID }: PercentInputProps) {
    const { field, fieldState } = useController({ control, name })
    const placeholderColor = useThemeColor('field-placeholder')
    const message = fieldState.error?.message
    const border = message ? 'border-danger' : 'border-border'
    return (
        <View className="mb-1 gap-1.5">
            <Text className="text-sm font-semibold text-foreground">{label}</Text>
            <View className="relative" style={{ minHeight: 44 }}>
                <RNTextInput
                    testID={testID}
                    accessibilityLabel={label}
                    value={field.value}
                    // Many locales' decimal keypads type "," for the decimal point.
                    onChangeText={text => field.onChange(text.replace(/,/g, '.'))}
                    onBlur={field.onBlur}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    autoCorrect={false}
                    placeholderTextColor={placeholderColor}
                    className={`rounded-lg border bg-background py-2.5 pl-3 pr-9 text-base text-foreground ${border}`}
                    style={[{ minHeight: 44 }, iosInputCenteringStyle(16)]}
                />
                <View
                    pointerEvents="none"
                    className="absolute right-0 top-0 items-center justify-center"
                    style={{ width: 36, height: 44 }}
                >
                    <Text className="text-base text-muted-foreground">%</Text>
                </View>
            </View>
            <FieldError message={message} />
        </View>
    )
}
