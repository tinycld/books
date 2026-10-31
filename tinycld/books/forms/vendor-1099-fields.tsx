import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { ContactInput } from '../components/forms/ContactInput'
import { TAX_ID_TYPE_OPTIONS } from '../lib/tax-id'
import { HostSelect } from './account-fields'

// The `books:vendor` 1099 host components (hosts.ts). Track payments for 1099 is a core
// `toggle` built-in and needs none. The core cell draws each one's label and error.

export const LEGAL_NAME_HINT = "The name on the vendor's W-9."
export const TAX_ID_HINT = "9 digits, from the vendor's W-9."

export function LegalNameField(props: BuiltinFieldProps) {
    return (
        <ContactInput
            {...props}
            keyboardType="default"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={200}
            hint={LEGAL_NAME_HINT}
        />
    )
}

export function TaxIdTypeField({ fieldKey, label, value, onChange, disabled }: BuiltinFieldProps) {
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={TAX_ID_TYPE_OPTIONS}
        />
    )
}

// No length cap: the server strips spaces and dashes before it counts digits.
export function TaxIdField(props: BuiltinFieldProps) {
    return (
        <ContactInput {...props} keyboardType="number-pad" autoComplete="off" hint={TAX_ID_HINT} />
    )
}
