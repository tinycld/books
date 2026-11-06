import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { useState } from 'react'
import { DialogLoadError } from '../components/taxes/DialogLoadError'
import { useTaxRateOptions } from '../hooks/useTaxRateOptions'
import { exemptionReasonOptions } from '../lib/exemption-reasons'
import { TAX_OPTIONS_LOADING } from '../lib/tax-messages'
import { taxRateOptions } from '../lib/tax-rate-options'
import { HostSelect } from './account-fields'

// The sales tax pickers any Books host may name (the customer host; later the invoice
// and sales receipt hosts). The core cell draws each one's label and error.

export function ExemptionReasonField({
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
            options={exemptionReasonOptions()}
        />
    )
}

function idOf(value: unknown) {
    return typeof value === 'string' ? value : ''
}

// "None" first, then the active rates under their agency and the active groups, as the
// Sales tax page's default picker offers them. A stored choice that has since become
// inactive stays listed, marked inactive, so the select keeps showing it and a save that
// does not touch it keeps it. The stored choice is the value the field mounted with, not
// the current one, so it stays listed after the user picks another rate.
export function TaxRateField({ fieldKey, label, value, onChange, disabled }: BuiltinFieldProps) {
    const { rows, agencies, isReady, isError, retry } = useTaxRateOptions()
    const [storedId] = useState(() => idOf(value))
    if (isError) {
        return <DialogLoadError isVisible testIdPrefix={`form-load-${fieldKey}`} onRetry={retry} />
    }
    // Until the rows load, a stored choice has no option to name it: the trigger says
    // the field is loading rather than going blank.
    const placeholder = isReady ? undefined : TAX_OPTIONS_LOADING
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={taxRateOptions(rows, agencies, storedId)}
            placeholder={placeholder}
        />
    )
}
