import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { ContactInput } from '../components/forms/ContactInput'
import { PAYMENT_TERM_OPTIONS } from '../lib/payment-terms'
import { HostSelect } from './account-fields'

// The `books:vendor` host components (hosts.ts); a later host may name
// `PaymentTermsField` too. The core cell draws each one's label and error.

export const ACCOUNT_NUMBER_HINT = 'Your account number with this vendor.'

export function PaymentTermsField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={PAYMENT_TERM_OPTIONS}
        />
    )
}

export function AccountNumberField(props: BuiltinFieldProps) {
    return (
        <ContactInput
            {...props}
            keyboardType="default"
            autoComplete="off"
            maxLength={100}
            hint={ACCOUNT_NUMBER_HINT}
        />
    )
}
