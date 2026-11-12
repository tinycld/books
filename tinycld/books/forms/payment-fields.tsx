import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { useState } from 'react'
import { useFormState } from 'react-hook-form'
import { Text, View } from 'react-native'
import { useDocumentFormScope } from '../components/documents/document-form-context'
import { useDepositAccounts } from '../hooks/useDepositAccounts'
import { defaultDepositAccount, depositAccountOptions } from '../lib/deposit-accounts'
import { paymentMethodOptions } from '../lib/payment-methods'
import { HostSelect } from './account-fields'

// The sales receipt's Payment row (the `books:sales_receipt` host): Payment method and
// Deposit to. The core cell draws each one's label and error.

const PAYMENT_METHOD_OPTIONS = paymentMethodOptions()

function idOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

// "None" (no method) first, then the fixed list (lib/payment-methods.ts).
export function PaymentMethodField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const { kind } = useDocumentFormScope()
    return (
        <View testID={`${kind.testId}-payment-method`}>
            <HostSelect
                fieldKey={fieldKey}
                label={label}
                value={value}
                onChange={onChange}
                disabled={disabled}
                options={PAYMENT_METHOD_OPTIONS}
            />
        </View>
    )
}

// The chart's own text while it has no deposit account; the cell's error (the form's
// schema says the same at a save) takes its place once there is one, so it never shows
// twice.
function NoDepositAccount({
    isVisible,
    message,
    testID,
}: {
    isVisible: boolean
    message: string
    testID: string
}) {
    if (!isVisible) return null
    return (
        <Text testID={testID} accessibilityRole="alert" className="mt-1 text-xs text-danger">
            {message}
        </Text>
    )
}

/**
 * Deposit to: the active bank and Undeposited funds accounts in chart order. A stored
 * account that is no longer offered (made inactive) shows by name for the value the
 * field mounted with only (TaxRateField's rule). The screen loads the accounts before the
 * form mounts and shows their load error with its Retry, so this read is served from the
 * store and has no loading or error state of its own.
 */
export function DepositAccountField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const { kind } = useDocumentFormScope()
    const { rows } = useDepositAccounts()
    const [storedId] = useState(() => idOf(value))
    const { options, triggerLabel } = depositAccountOptions(rows, storedId)
    const { errors } = useFormState({ name: fieldKey })
    const hasFieldError = errors[fieldKey] !== undefined
    const isChartEmpty = options.length === 0 && !hasFieldError
    // A form opened with no account (none in the chart then) shows the default rule's
    // account once there is one; the save writes the same account (useDocumentSave).
    const shown = idOf(value) || defaultDepositAccount(rows)
    return (
        <View testID={`${kind.testId}-deposit-to`}>
            <HostSelect
                fieldKey={fieldKey}
                label={label}
                value={shown}
                onChange={onChange}
                disabled={disabled}
                options={options}
                placeholder={triggerLabel || undefined}
            />
            <NoDepositAccount
                isVisible={isChartEmpty}
                message={kind.messages.depositNone ?? ''}
                testID={`${kind.testId}-deposit-error`}
            />
        </View>
    )
}
