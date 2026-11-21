import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import {
    Platform,
    TextInput as RNTextInput,
    type TextInputFocusEvent,
    type TextInputInstance,
} from 'react-native'
import { moneyInputCents, moneyInputText } from '../lib/money-input'
import { amountCents } from '../lib/opening-balances'

type MoneyTextFieldProps = {
    value: string
    onChangeText: (text: string) => void
    onBlur: () => void
    // The field's message; the caller draws the text, the field only colours its border.
    error?: string
    testID: string
    accessibilityLabel: string
    // A fixed width (a split line's Amount); the field fills its frame without one.
    width?: number
    // The currency the text is read in; without one any currency form reads (MoneyInput).
    currency?: string
    editable?: boolean
    // Room on the left for a control the caller draws over the field (MoneyInput's ±).
    hasPrefix?: boolean
    // A negative amount shows in the danger tone (an opening balance against its side).
    marksNegative?: boolean
    // Web: the whole value is selected when the field takes the focus (a line cell).
    selectsOnFocus?: boolean
    returnKeyType?: 'next' | 'done'
    onSubmitEditing?: () => void
    inputRef?: (node: TextInputInstance | null) => void
}

function centsOf(text: string, currency: string | undefined): number | null {
    return currency === undefined ? amountCents(text) : moneyInputCents(text, currency)
}

// On web the focus event's target is the input element.
function selectAll(event: TextInputFocusEvent) {
    if (Platform.OS !== 'web') return
    const field: unknown = event.target
    if (typeof HTMLInputElement !== 'undefined' && field instanceof HTMLInputElement) {
        field.select()
    }
}

// The money text field of Books: right aligned, tabular figures, the decimal keyboard. On
// blur, text that reads as money is shown formatted (moneyInputText: "1,234.50", and ''
// for 0); text that does not read is left as typed, for the caller's message.
export function MoneyTextField({
    value,
    onChangeText,
    onBlur,
    error,
    testID,
    accessibilityLabel,
    width,
    currency,
    editable = true,
    hasPrefix = false,
    marksNegative = false,
    selectsOnFocus = false,
    returnKeyType,
    onSubmitEditing,
    inputRef,
}: MoneyTextFieldProps) {
    const placeholderColor = useThemeColor('field-placeholder')
    const border = error ? 'border-danger' : 'border-border'
    const isNegative = marksNegative && value.trim().startsWith('-')
    const tone = isNegative ? 'text-danger' : 'text-foreground'
    const padLeft = hasPrefix ? 'pl-11' : 'pl-3'
    // A field that takes no text is dimmed, as core's disabled fields are.
    const dim = editable ? '' : 'opacity-60'
    const style = { minHeight: 44, width }
    const onFocus = selectsOnFocus ? selectAll : undefined

    const onFieldBlur = () => {
        onBlur()
        const cents = centsOf(value, currency)
        if (cents === null) return
        onChangeText(moneyInputText(cents))
    }

    return (
        <RNTextInput
            ref={inputRef}
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            value={value}
            onChangeText={onChangeText}
            onBlur={onFieldBlur}
            onFocus={onFocus}
            onSubmitEditing={onSubmitEditing}
            returnKeyType={returnKeyType}
            submitBehavior="submit"
            editable={editable}
            aria-disabled={!editable}
            inputMode="decimal"
            placeholder="0.00"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            className={`rounded-lg border bg-background py-2.5 ${padLeft} pr-3 text-right text-base tabular-nums ${border} ${tone} ${dim}`}
            style={style}
        />
    )
}
