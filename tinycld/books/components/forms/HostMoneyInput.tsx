import { useController } from '@tinycld/core/ui/form'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import { useRef } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { moneyTextSchema } from '../../lib/host-value-schemas'
import {
    moneyFieldValue,
    moneyHostText,
    moneyInputCents,
    moneyInputText,
} from '../../lib/money-input'
import { useHostValueForm } from './use-host-value-form'

interface HostMoneyInputProps {
    fieldKey: string
    label: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
    currency: string
}

/**
 * A money amount in integer cents: a right-aligned text input with a decimal keyboard,
 * empty for 0, reformatted on blur. It draws no error of its own: the core cell shows
 * the engine's issue from MONEY_VALUE_SCHEMA under it.
 */
export function HostMoneyInput({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    currency,
}: HostMoneyInputProps) {
    // The outer value comes back as cents. Without the typed text, each keystroke's
    // echo would reset the input to the formatted amount under the cursor.
    const typed = useRef<string | null>(null)
    const form = useHostValueForm(moneyTextSchema, {
        text: moneyHostText(typed.current, value, currency),
    })
    const { field } = useController({ control: form.control, name: 'text' })

    // Text that does not parse is sent as itself: the engine's schema (forms/ui.ts
    // `schemas`) refuses it with the cell's inline message and blocks the save, so a
    // save never writes a value the input does not show.
    const onChangeText = (text: string) => {
        typed.current = text
        field.onChange(text)
        onChange(moneyFieldValue(text, currency))
    }
    const onBlur = () => {
        field.onBlur()
        const cents = moneyInputCents(field.value, currency)
        if (cents === null) return
        const text = moneyInputText(cents)
        typed.current = text
        field.onChange(text)
    }

    return (
        <RNTextInput
            testID={`form-input-${fieldKey}`}
            accessibilityLabel={label}
            value={field.value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            editable={!disabled}
            inputMode="decimal"
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-right text-base text-foreground"
            style={iosInputCenteringStyle(16)}
        />
    )
}
