import { useController } from '@tinycld/core/ui/form'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import { useRef } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { moneyTextSchema } from '../../lib/host-value-schemas'
import {
    quantityFieldValue,
    quantityHostText,
    quantityInputNumber,
    quantityInputText,
} from '../../lib/quantity-input'
import { useHostValueForm } from './use-host-value-form'

interface HostQuantityInputProps {
    fieldKey: string
    label: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
}

/**
 * A quantity with at most 2 decimals: a right-aligned text input with a decimal
 * keyboard, empty for 0, shown plain again on blur. It draws no error of its own: the
 * core cell shows the engine's issue from QUANTITY_VALUE_SCHEMA under it.
 */
export function HostQuantityInput({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: HostQuantityInputProps) {
    // The outer value comes back as a number. Without the typed text, each keystroke's
    // echo would reset the input ("1." would lose its point).
    const typed = useRef<string | null>(null)
    const form = useHostValueForm(moneyTextSchema, {
        text: quantityHostText(typed.current, value),
    })
    const { field } = useController({ control: form.control, name: 'text' })

    // Text that does not parse is sent as itself: the engine's schema (forms/ui.ts
    // `schemas`) refuses it with the cell's inline message and blocks the save.
    const onChangeText = (text: string) => {
        typed.current = text
        field.onChange(text)
        onChange(quantityFieldValue(text))
    }
    const onBlur = () => {
        field.onBlur()
        const quantity = quantityInputNumber(field.value)
        if (quantity === null) return
        const text = quantityInputText(quantity)
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
