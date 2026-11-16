import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { SelectInput } from '@tinycld/core/ui/form'
import { useState } from 'react'
import {
    type Control,
    type FieldValues,
    get,
    type Path,
    useFormContext,
    useFormState,
    useWatch,
} from 'react-hook-form'
import { Text, View } from 'react-native'
import { useDocumentFormScope } from '../components/documents/document-form-context'
import { useHostValueForm } from '../components/forms/use-host-value-form'
import { useDepositAccounts } from '../hooks/useDepositAccounts'
import { usePaidFromAccounts } from '../hooks/usePaidFromAccounts'
import { defaultDepositAccount, depositAccountOptions } from '../lib/deposit-accounts'
import { selectValueSchema } from '../lib/host-value-schemas'
import { defaultMethodFor, PAID_FROM_EMPTY_TEXT } from '../lib/paid-from'
import { paymentMethodOptions } from '../lib/payment-methods'
import { transferBalanceLine } from '../lib/transfer'
import { HostSelect } from './account-fields'

// The payment fields: the scope-free selects any form binds through its own `control`
// (Pay Bills, which is not a forms host), and the payment built-ins of a document host
// that wrap them: the sales receipt's Payment row (Payment method and Deposit to) and the
// expense's and bill's Paid from and required Payment method. In a host the core cell
// draws each one's label and error.

const OPTIONS_WITH_NONE = paymentMethodOptions({ allowNone: true })
const OPTIONS_WITHOUT_NONE = paymentMethodOptions({ allowNone: false })

// The trigger text while no option matches the value. With "None" offered an empty value
// matches it, so only the required Payment method and Paid from show these.
const METHOD_PLACEHOLDER = 'Choose a method'
const PAID_FROM_PLACEHOLDER = 'Choose an account'

function idOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

export interface PaymentMethodSelectProps<T extends FieldValues> {
    control: Control<T>
    name: Path<T>
    // `<prefix>-method` names the trigger unless `triggerTestID` does.
    testIdPrefix: string
    // Whether "None" (no method) is offered first.
    allowNone: boolean
    label?: string
    // A form cell draws the label and the error itself.
    hideLabel?: boolean
    hideError?: boolean
    disabled?: boolean
    triggerTestID?: string
    onValueChange?: (value: string) => void
}

/**
 * Payment method over the fixed list (lib/payment-methods.ts), with "None" first when
 * `allowNone`; bound to any form through its `control`, with no document scope.
 */
export function PaymentMethodSelect<T extends FieldValues>({
    control,
    name,
    testIdPrefix,
    allowNone,
    label = 'Payment method',
    hideLabel = false,
    hideError = false,
    disabled = false,
    triggerTestID,
    onValueChange,
}: PaymentMethodSelectProps<T>) {
    const options = allowNone ? OPTIONS_WITH_NONE : OPTIONS_WITHOUT_NONE
    const placeholder = allowNone ? undefined : METHOD_PLACEHOLDER
    return (
        <SelectInput
            name={name}
            control={control}
            label={label}
            hideLabel={hideLabel}
            hideError={hideError}
            options={options}
            disabled={disabled}
            placeholder={placeholder}
            onValueChange={onValueChange}
            testID={triggerTestID ?? `${testIdPrefix}-method`}
        />
    )
}

type PaymentMethodFieldProps = BuiltinFieldProps & {
    // Whether "None" (no method) is offered first; true by default (a sales receipt's).
    allowNone?: boolean
}

// A document host's Payment method: PaymentMethodSelect bound to the host value through a
// local form (HostSelect's way), with the cell's label and error.
export function PaymentMethodField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    allowNone = true,
}: PaymentMethodFieldProps) {
    const { kind } = useDocumentFormScope()
    const form = useHostValueForm(selectValueSchema, { value: idOf(value) })
    return (
        <View testID={`${kind.testId}-payment-method`}>
            <PaymentMethodSelect
                control={form.control}
                name="value"
                testIdPrefix={kind.testId}
                allowNone={allowNone}
                label={label}
                hideLabel
                hideError
                disabled={disabled}
                triggerTestID={`form-input-${fieldKey}`}
                onValueChange={onChange}
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
export function NoAccountText({
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
// form shows it: not as of the payment date and not after this payment. Nothing while no
// account is picked, and nothing while the account's row is not loaded (`undefined`): a
// figure there would be false.
export function PaidFromBalance({
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

export type PaidFromAccount = ReturnType<typeof usePaidFromAccounts>['accounts'][number]

export interface PaidFromSelectProps<T extends FieldValues> {
    control: Control<T>
    name: Path<T>
    // `<prefix>-paid-from` names the trigger unless `triggerTestID` does;
    // `<prefix>-paid-from-balance` the balance and `<prefix>-paid-from-error` the empty
    // chart's text.
    testIdPrefix: string
    currency: string
    // A pick of another account, with its row (undefined while the row is not loaded).
    onPick: (id: string, account: PaidFromAccount | undefined) => void
    label?: string
    // A form cell draws the label and the error itself.
    hideLabel?: boolean
    hideError?: boolean
    // An error the caller draws for this field (a form cell's): the empty chart's text
    // then gives way, so it never shows twice.
    hasCallerError?: boolean
    disabled?: boolean
    // The stored account the form opened with: shown by name while it is not offered.
    storedId?: string
    triggerTestID?: string
    autoFocus?: boolean
}

/**
 * Paid from: the active bank and credit card accounts in chart order, "<number> <name>",
 * indented, bound to any form through its `control`, with no document scope. A stored
 * account that is no longer offered (made inactive) shows by name for `storedId` only
 * (DepositAccountField's rule). Under it, the picked account's balance, or with no such
 * account in the chart PAID_FROM_EMPTY_TEXT. The screen loads the accounts before the form
 * mounts and shows their load error with its Retry, so this read is served from the store
 * and has no loading or error state of its own.
 */
export function PaidFromSelect<T extends FieldValues>({
    control,
    name,
    testIdPrefix,
    currency,
    onPick,
    label = 'Paid from',
    hideLabel = false,
    hideError = false,
    hasCallerError = false,
    disabled = false,
    storedId = '',
    triggerTestID,
    autoFocus = false,
}: PaidFromSelectProps<T>) {
    const paidFrom = usePaidFromAccounts()
    const { options, triggerLabel } = paidFrom.optionsFor(storedId)
    const accountId = idOf(useWatch({ control, name }))
    const { errors } = useFormState({ control, name })
    const hasFieldError = hasCallerError || get(errors, name) !== undefined
    const isChartEmpty = options.length === 0 && !hasFieldError
    const handleChange = (id: string) =>
        onPick(
            id,
            paidFrom.accounts.find(row => row.id === id)
        )
    return (
        <View>
            <SelectInput
                name={name}
                control={control}
                label={label}
                hideLabel={hideLabel}
                hideError={hideError}
                options={options}
                disabled={disabled}
                placeholder={triggerLabel || PAID_FROM_PLACEHOLDER}
                onValueChange={handleChange}
                testID={triggerTestID ?? `${testIdPrefix}-paid-from`}
                autoFocus={autoFocus}
            />
            <PaidFromBalance
                accountId={accountId}
                balanceOf={paidFrom.balanceOf}
                currency={currency}
                testID={`${testIdPrefix}-paid-from-balance`}
            />
            <NoAccountText
                isVisible={isChartEmpty}
                message={PAID_FROM_EMPTY_TEXT}
                testID={`${testIdPrefix}-paid-from-error`}
            />
        </View>
    )
}

/**
 * Paid from of a document host (an expense's, a bill's): PaidFromSelect bound to the host
 * value through a local form (HostSelect's way), with the cell's label and error. Picking
 * an account sets Payment method by its type (defaultMethodFor); the user may change the
 * method after, and a later pick sets it again.
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
    const form = useHostValueForm(selectValueSchema, { value: idOf(value) })
    const [storedId] = useState(() => idOf(value))
    const { errors, isSubmitted } = useFormState({ name: fieldKey })
    const hasCellError = errors[fieldKey] !== undefined
    const pick = (id: string, account: PaidFromAccount | undefined) => {
        onChange(id)
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
            <PaidFromSelect
                control={form.control}
                name="value"
                testIdPrefix={kind.testId}
                currency={currency}
                onPick={pick}
                label={label}
                hideLabel
                hideError
                hasCallerError={hasCellError}
                disabled={disabled}
                storedId={storedId}
                triggerTestID={`form-input-${fieldKey}`}
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
