import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import {
    Platform,
    Pressable,
    TextInput as RNTextInput,
    Text,
    type TextInputFocusEvent,
    type TextInputInstance,
    View,
} from 'react-native'
import { moneyInputCents, moneyInputText } from '../lib/money-input'
import { flipMoneySign } from '../lib/money-text'
import { amountCents } from '../lib/opening-balances'

// The "±" press target drawn inside the field, on the left. `isTabStop` false keeps it out
// of the Tab order (a deposit line: Amount → Remove, bank deposit spec §3.2); the opening
// balances cell keeps it as a Tab stop (the default).
type SignToggle = { testID: string; accessibilityLabel: string; isTabStop?: boolean }

// The sign control's touch target, the field's least height.
const SIGN_TARGET = 44

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
    // A "±" press target inside the field that flips the sign of the text (flipMoneySign),
    // for every caller that accepts a negative amount: a phone's decimal keyboard may have
    // no minus key (iOS). The minus key still works where a keyboard has one.
    signToggle?: SignToggle
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

// With `isTabStop` false a press target only (`tabIndex={-1}`): Tab goes from the field to
// the next control, and a keyboard types the minus sign.
function SignButton({
    toggle,
    disabled,
    onPress,
}: {
    toggle: SignToggle
    disabled: boolean
    onPress: () => void
}) {
    const tabIndex = toggle.isTabStop === false ? -1 : undefined
    return (
        <Pressable
            testID={toggle.testID}
            accessibilityRole="button"
            accessibilityLabel={toggle.accessibilityLabel}
            disabled={disabled}
            aria-disabled={disabled}
            tabIndex={tabIndex}
            onPress={onPress}
            className="absolute left-0 top-0 items-center justify-center"
            style={{ width: SIGN_TARGET, height: SIGN_TARGET }}
        >
            <Text className="text-base text-muted-foreground">±</Text>
        </Pressable>
    )
}

// The money text field of Books: right aligned, tabular figures, the decimal keyboard. On
// blur, text that reads as money is shown formatted (moneyInputText: "1,234.50", and ''
// for 0); text that does not read is left as typed, for the caller's message. With
// `signToggle`, the "±" control sits inside the field on the left.
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
    signToggle,
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
    const padLeft = signToggle ? 'pl-11' : 'pl-3'
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

    const flipSign = () => {
        const flipped = flipMoneySign(value)
        if (flipped !== value) onChangeText(flipped)
    }

    const field = (
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
    if (!signToggle) return field

    return (
        <View className="relative" style={style}>
            {field}
            <SignButton toggle={signToggle} disabled={!editable} onPress={flipSign} />
        </View>
    )
}
