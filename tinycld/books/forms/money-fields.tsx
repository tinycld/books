import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { HostMoneyInput } from '../components/forms/HostMoneyInput'
import { useBooksSettings } from '../hooks/useBooksSettings'

// A money amount any Books host may name, read and typed in the Books currency. The
// core cell draws its label and error.
export function MoneyField({ fieldKey, label, value, onChange, disabled }: BuiltinFieldProps) {
    const currency = useBooksSettings().settings?.currency ?? 'USD'
    return (
        <HostMoneyInput
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            currency={currency}
        />
    )
}
