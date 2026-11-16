import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import type { Ref } from 'react'
import { TextInput as RNTextInput, Text, type TextInputInstance, View } from 'react-native'
import { useSelectAllOnFocus } from '../../hooks/useSelectAllOnFocus'

interface PaymentMoneyFieldProps {
    value: string
    onChangeText: (text: string) => void
    testID: string
    accessibilityLabel: string
    // The field's message, drawn under it with `errorTestID`; '' draws none.
    error: string
    errorTestID: string
    inputRef?: Ref<TextInputInstance>
    onSubmitEditing?: () => void
    onFocus?: () => void
    onBlur?: () => void
    isLast?: boolean
    // A save runs: the field waits for it.
    isDisabled?: boolean
}

export function FieldError({ message, testID }: { message: string; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} role="alert" className="mt-1 text-xs text-danger">
            {message}
        </Text>
    )
}

/**
 * A money input of the payment form (Amount received, a row's Payment): right-aligned,
 * tabular figures, the decimal keypad, and its whole value selected on focus so typing
 * replaces it (lesson 25). It draws core TextInput's input (the same classes and the
 * themed placeholder colour), but is controlled by value: every change goes through the
 * caller's allocation handler, and a row's path (`payments.<id>.amount`) must not be bound
 * while the row has no entry, or react-hook-form writes a half entry into the values.
 * Core TextInput binds its path and owns its classes (no `tabular-nums`), so it is not
 * used here. Amount received passes react-hook-form's field ref as `inputRef`, so a
 * refused submit focuses it.
 */
export function PaymentMoneyField({
    value,
    onChangeText,
    testID,
    accessibilityLabel,
    error,
    errorTestID,
    inputRef,
    onSubmitEditing,
    onFocus,
    onBlur,
    isLast = false,
    isDisabled = false,
}: PaymentMoneyFieldProps) {
    const selectAll = useSelectAllOnFocus(value)
    const placeholderColor = useThemeColor('field-placeholder')
    const border = error ? 'border-danger' : 'border-border'
    const returnKeyType = isLast ? 'done' : 'next'
    const handleFocus: typeof selectAll.onFocus = event => {
        selectAll.onFocus(event)
        onFocus?.()
    }
    const handleBlur = () => {
        selectAll.onBlur()
        onBlur?.()
    }
    const handleChange = (text: string) => {
        selectAll.onTyped()
        onChangeText(text)
    }
    return (
        <View className="min-w-0">
            <RNTextInput
                ref={inputRef}
                testID={testID}
                accessibilityLabel={accessibilityLabel}
                value={value}
                onChangeText={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyPress={selectAll.onKeyPress}
                selectTextOnFocus={selectAll.selectTextOnFocus}
                onSubmitEditing={onSubmitEditing}
                blurOnSubmit={false}
                returnKeyType={returnKeyType}
                editable={!isDisabled}
                aria-disabled={isDisabled}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={placeholderColor}
                className={`min-h-11 min-w-0 rounded-lg border bg-background px-3 py-2.5 text-right text-base text-foreground tabular-nums ${border}`}
                style={iosInputCenteringStyle(16)}
            />
            <FieldError message={error} testID={errorTestID} />
        </View>
    )
}
