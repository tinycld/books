import { useLiveQuery } from '@tanstack/react-db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { SelectInput } from '@tinycld/core/ui/form'
import { ContactInput } from '../components/forms/ContactInput'
import { useHostValueForm } from '../components/forms/use-host-value-form'
import { expenseAccountOptions } from '../lib/expense-account-options'
import { selectValueSchema } from '../lib/host-value-schemas'
import { PAYMENT_TERM_OPTIONS } from '../lib/payment-terms'

// The `books:vendor` host components (hosts.ts); a later host may name
// `PaymentTermsField` and `ExpenseAccountField` too. The core cell draws each one's
// label and error.

export const ACCOUNT_NUMBER_HINT = 'Your account number with this vendor.'

interface HostSelectProps {
    fieldKey: string
    label: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
    options: { value: string; label: string }[]
    placeholder?: string
}

// Core SelectInput bound to the host value through a local form. The cell draws the
// label, so the select keeps it as the trigger's accessible name only.
export function HostSelect({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    options,
    placeholder,
}: HostSelectProps) {
    const form = useHostValueForm(selectValueSchema, {
        value: typeof value === 'string' ? value : '',
    })
    return (
        <SelectInput
            name="value"
            control={form.control}
            label={label}
            hideLabel
            hideError
            options={options}
            disabled={disabled}
            placeholder={placeholder}
            onValueChange={onChange}
            testID={`form-input-${fieldKey}`}
        />
    )
}

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

// A stored account that became inactive is not offered but shows its name in the
// trigger; an untouched field is not dirty, so the save leaves it out of the patch.
export function ExpenseAccountField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const [accountsCollection] = useStore('books_accounts')
    const { data } = useLiveQuery({
        query: q => q.from({ account: accountsCollection }),
        queryKey: ['books.vendor-form.accounts'],
    })
    const { options, triggerLabel } = expenseAccountOptions(
        data ?? [],
        typeof value === 'string' ? value : ''
    )
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={options}
            placeholder={triggerLabel}
        />
    )
}
