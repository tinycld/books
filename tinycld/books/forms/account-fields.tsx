import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { SelectInput } from '@tinycld/core/ui/form'
import { useHostValueForm } from '../components/forms/use-host-value-form'
import { useFormAccounts } from '../hooks/useFormAccounts'
import { expenseAccountOptions } from '../lib/expense-account-options'
import { selectValueSchema } from '../lib/host-value-schemas'

// Account pickers any Books host may name. The core cell draws each one's label and
// error.

export interface HostSelectProps {
    fieldKey: string
    label: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
    options: { value: string; label: string; indent?: number }[]
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

// A stored account that became inactive is not offered but shows its name in the
// trigger; an untouched field is not dirty, so the save leaves it out of the patch.
export function ExpenseAccountField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const { accounts } = useFormAccounts()
    const { options, triggerLabel } = expenseAccountOptions(
        accounts,
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
