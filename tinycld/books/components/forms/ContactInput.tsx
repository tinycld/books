import { TextInput } from '@tinycld/core/ui/form'
import type { KeyboardTypeOptions, TextInputProps } from 'react-native'
import { contactValueSchema } from '../../lib/host-value-schemas'
import { useHostValueForm } from './use-host-value-form'

interface ContactInputProps {
    fieldKey: string
    label: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
    keyboardType: KeyboardTypeOptions
    autoComplete: TextInputProps['autoComplete']
    maxLength?: number
    hint?: string
    autoCapitalize?: TextInputProps['autoCapitalize']
    // Rewrites what is typed before it reaches the field (a code is upper case).
    transform?: (text: string) => string
}

/**
 * Email, phone, website, account number, legal name, tax ID, record names and codes: a
 * text input with the keyboard native shows for the kind.
 * The core cell draws the label and the field's one error, so a local length error
 * only colours the border, and `maxLength` stops typing past the server's limit. A
 * `hint` shows under the input while it has no local error.
 */
export function ContactInput({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    keyboardType,
    autoComplete,
    maxLength,
    hint,
    autoCapitalize = 'none',
    transform,
}: ContactInputProps) {
    const form = useHostValueForm(contactValueSchema(maxLength), {
        text: typeof value === 'string' ? value : '',
    })
    const change = (text: string) => {
        const next = transform ? transform(text) : text
        if (next !== text) form.setValue('text', next, { shouldValidate: true })
        onChange(next)
    }
    return (
        <TextInput
            name="text"
            control={form.control}
            hideError
            hint={hint}
            maxLength={maxLength}
            testID={`form-input-${fieldKey}`}
            accessibilityLabel={label}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            editable={!disabled}
            onValueChange={change}
        />
    )
}
