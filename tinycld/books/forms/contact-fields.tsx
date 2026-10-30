import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { AddressField } from '../components/forms/AddressField'
import { ContactInput } from '../components/forms/ContactInput'
import { PHONE_MAX_LENGTH } from '../lib/host-value-schemas'

// The contact host components every Books host names (hosts.ts). The core cell draws
// each one's label and error.

export function EmailField(props: BuiltinFieldProps) {
    return <ContactInput {...props} keyboardType="email-address" autoComplete="email" />
}

export function PhoneField(props: BuiltinFieldProps) {
    return (
        <ContactInput
            {...props}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={PHONE_MAX_LENGTH}
        />
    )
}

export function WebsiteField(props: BuiltinFieldProps) {
    return <ContactInput {...props} keyboardType="url" autoComplete="url" />
}

// One address with no Same-as toggle; an all-empty address is sent as null.
export function PlainAddressField(props: BuiltinFieldProps) {
    return <AddressField {...props} variant="billing" />
}
