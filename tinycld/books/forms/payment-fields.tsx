import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { useState } from 'react'
import { useFormContext, useFormState } from 'react-hook-form'
import { Text, View } from 'react-native'
import { useDocumentFormScope } from '../components/documents/document-form-context'
import { useDepositAccounts } from '../hooks/useDepositAccounts'
import { usePaidFromAccounts } from '../hooks/usePaidFromAccounts'
import { defaultDepositAccount, depositAccountOptions } from '../lib/deposit-accounts'
import { defaultMethodFor, PAID_FROM_EMPTY_TEXT } from '../lib/paid-from'
import { paymentMethodOptions } from '../lib/payment-methods'
import { transferBalanceLine } from '../lib/transfer'
import { HostSelect } from './account-fields'

// The payment built-ins of a document host: the sales receipt's Payment row (Payment
// method and Deposit to) and the expense's Paid from and required Payment method. The
// core cell draws each one's label and error.

const OPTIONS_WITH_NONE = paymentMethodOptions({ allowNone: true })
const OPTIONS_WITHOUT_NONE = paymentMethodOptions({ allowNone: false })

// The trigger text while no option matches the value. With "None" offered an empty value
// matches it, so only the required Payment method and Paid from show these.
const METHOD_PLACEHOLDER = 'Choose a method'
const PAID_FROM_PLACEHOLDER = 'Choose an account'

function idOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

type PaymentMethodFieldProps = BuiltinFieldProps & {
    // Whether "None" (no method) is offered first; true by default (a sales receipt's).
    allowNone?: boolean
}

// The fixed list (lib/payment-methods.ts), with "None" first unless `allowNone` is false.
export function PaymentMethodField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    allowNone = true,
}: PaymentMethodFieldProps) {
    const { kind } = useDocumentFormScope()
    const options = allowNone ? OPTIONS_WITH_NONE : OPTIONS_WITHOUT_NONE
    const placeholder = allowNone ? undefined : METHOD_PLACEHOLDER
    return (
        <View testID={`${kind.testId}-payment-method`}>
            <HostSelect
                fieldKey={fieldKey}
                label={label}
                value={value}
                onChange={onChange}
                disabled={disabled}
                options={options}
                placeholder={placeholder}
            />
        </View>
    )
}

// A Payment method that is required (an expense's): the fixed list with no "None".
export function RequiredPaymentMethodField(props: BuiltinFieldProps) {
    return <PaymentMethodField {...props} allowNone={false} />
}

// The chart's own text while it has no account of the field's kind (a deposit account,
// a bank or credit card account); the cell's error takes its place once there is one, so
// it never shows twice.
function NoAccountText({
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

// The picked account's own posted balance, the Chart of Accounts figure, as the transfer
// form shows it: not as of the payment date and not after this expense. Nothing while no
// account is picked, and nothing while the account's row is not loaded (`undefined`): a
// figure there would be false.
function PaidFromBalance({
    accountId,
    balanceOf,
    currency,
    testID,
}: {
    accountId: string
    balanceOf: (id: string) => number | null | undefined
    currency: string
    testID: string
}) {
    if (!accountId) return null
    const balance = balanceOf(accountId)
    if (balance === undefined) return null
    // null: the balance is not exact; transferBalanceLine has its own text for it.
    const { text, isAlert } = transferBalanceLine(balance, currency)
    const tone = isAlert ? 'text-danger' : 'text-muted-foreground'
    return (
        <Text testID={testID} className={`mt-1 text-sm tabular-nums ${tone}`}>
            {text}
        </Text>
    )
}

/**
 * Paid from (an expense's): the active bank and credit card accounts in chart order,
 * "<number> <name>", indented. A stored account that is no longer offered (made inactive)
 * shows by name for the value the field mounted with only (DepositAccountField's rule).
 * Picking an account sets Payment method by its type (defaultMethodFor); the user may
 * change the method after, and a later pick sets it again. Under it, the picked account's
 * balance. The screen loads the accounts before the form mounts and shows their load
 * error with its Retry, so this read is served from the store and has no loading or error
 * state of its own.
 */
export function PaymentAccountField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const { kind, currency } = useDocumentFormScope()
    const { setValue, clearErrors } = useFormContext<FormValues>()
    const paidFrom = usePaidFromAccounts()
    const [storedId] = useState(() => idOf(value))
    const { options, triggerLabel } = paidFrom.optionsFor(storedId)
    const { errors, isSubmitted } = useFormState({ name: fieldKey })
    const hasFieldError = errors[fieldKey] !== undefined
    const isChartEmpty = options.length === 0 && !hasFieldError
    const pick = (next: unknown) => {
        onChange(next)
        const account = paidFrom.accounts.find(row => row.id === next)
        if (!account) return
        // The pick sets a valid method, so a shown error on it (the required rule after a
        // submit, or a server refusal) goes; after a submit the rules run again on it.
        clearErrors('payment_method')
        setValue('payment_method', defaultMethodFor(account), {
            shouldDirty: true,
            shouldValidate: isSubmitted,
        })
    }
    return (
        <View testID={`${kind.testId}-paid-from`}>
            <HostSelect
                fieldKey={fieldKey}
                label={label}
                value={value}
                onChange={pick}
                disabled={disabled}
                options={options}
                placeholder={triggerLabel || PAID_FROM_PLACEHOLDER}
            />
            <PaidFromBalance
                accountId={idOf(value)}
                balanceOf={paidFrom.balanceOf}
                currency={currency}
                testID={`${kind.testId}-paid-from-balance`}
            />
            <NoAccountText
                isVisible={isChartEmpty}
                message={PAID_FROM_EMPTY_TEXT}
                testID={`${kind.testId}-paid-from-error`}
            />
        </View>
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
            <NoAccountText
                isVisible={isChartEmpty}
                message={kind.messages.depositNone ?? ''}
                testID={`${kind.testId}-deposit-error`}
            />
        </View>
    )
}
