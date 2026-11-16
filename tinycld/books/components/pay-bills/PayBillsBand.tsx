import { TextInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { ReactNode } from 'react'
import { get, useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import { PaidFromSelect, PaymentMethodSelect } from '../../forms/payment-fields'
import type { PayBillsFormState } from '../../hooks/usePayBillsForm'
import { FieldError } from '../payments/PaymentMoneyField'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const TEST_ID_PREFIX = 'pay-bills'

const WIDE_WIDTHS = {
    paidFrom: { width: 300 },
    date: { width: 180 },
    method: { width: 180 },
    checkNo: { width: 180 },
} as const

const PHONE_WIDTHS = {
    paidFrom: undefined,
    date: undefined,
    method: undefined,
    checkNo: undefined,
} as const

type Control = PayBillsFormState['form']['control']

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
    return (
        <View className="min-w-0" style={style}>
            <Text className="mb-1 text-sm font-semibold text-foreground">{label}</Text>
            {children}
        </View>
    )
}

function errorText(errors: unknown, path: string): string {
    const message: unknown = get(errors, path)?.message
    return typeof message === 'string' ? message : ''
}

// Payment date: core DateField (its own "Open calendar" button follows it in Tab order).
function PaymentDateInput({ control, isDisabled }: { control: Control; isDisabled: boolean }) {
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    return (
        <DateField
            value={field.value}
            onChange={handleChange}
            withTime={false}
            disabled={isDisabled}
            accessibilityLabel="Payment date"
            testID={`${TEST_ID_PREFIX}-date`}
        />
    )
}

interface CheckNoFieldProps {
    isVisible: boolean
    label: string
    isDigits: boolean
    control: Control
    error: string
    isDisabled: boolean
    style?: object
}

// Starting check no. (digits, at most 9) or, on `?replaces`, the payment's Check no. (any
// text up to 40): shown only while Payment method is Check (the schema's rules); its error
// under it by its own test id.
function CheckNoField({
    isVisible,
    label,
    isDigits,
    control,
    error,
    isDisabled,
    style,
}: CheckNoFieldProps) {
    if (!isVisible) return null
    const inputMode = isDigits ? 'numeric' : 'text'
    const keyboardType = isDigits ? 'number-pad' : 'default'
    return (
        <View style={style}>
            <TextInput
                name="reference_no"
                control={control}
                label={label}
                hideError
                editable={!isDisabled}
                inputMode={inputMode}
                keyboardType={keyboardType}
                testID={`${TEST_ID_PREFIX}-check-no`}
            />
            <FieldError message={error} testID={`${TEST_ID_PREFIX}-check-no-error`} />
        </View>
    )
}

interface PayBillsBandProps {
    payForm: PayBillsFormState
    currency: string
    isPhone: boolean
    // A Pay runs: the fields wait for it.
    isDisabled: boolean
}

/**
 * The band (spec §3.2): Paid from with its balance, Payment date, Payment method and,
 * while the method is Check, Starting check no. (Check no. on `?replaces`). One row on a
 * wide screen, stacked on a
 * phone. Paid from takes the focus on web when it mounts; Pay & new remounts it (its key)
 * so it takes the focus again. Picking it sets the method (`defaultMethodFor`).
 */
export function PayBillsBand({ payForm, currency, isPhone, isDisabled }: PayBillsBandProps) {
    const { form, paidFromMount, onPaidFromPick, isCheckNoVisible } = payForm
    const { control, formState } = form
    const widths = isPhone ? PHONE_WIDTHS : WIDE_WIDTHS
    const layout = isPhone ? 'gap-3' : 'flex-row flex-wrap items-start gap-4'
    const dateError = errorText(formState.errors, 'date')
    const checkNoError = errorText(formState.errors, 'reference_no')
    return (
        <View testID={`${TEST_ID_PREFIX}-band`} className={`${BAND} ${layout}`}>
            <View className="min-w-0" style={widths.paidFrom}>
                <PaidFromSelect
                    key={paidFromMount}
                    control={control}
                    name="paid_from"
                    testIdPrefix={TEST_ID_PREFIX}
                    currency={currency}
                    onPick={onPaidFromPick}
                    disabled={isDisabled}
                    autoFocus
                />
            </View>
            <Field label="Payment date" style={widths.date}>
                <PaymentDateInput control={control} isDisabled={isDisabled} />
                <FieldError message={dateError} testID={`${TEST_ID_PREFIX}-date-error`} />
            </Field>
            <View className="min-w-0" style={widths.method}>
                <PaymentMethodSelect
                    control={control}
                    name="payment_method"
                    testIdPrefix={TEST_ID_PREFIX}
                    allowNone={false}
                    disabled={isDisabled}
                />
            </View>
            <CheckNoField
                isVisible={isCheckNoVisible}
                label={payForm.checkNoLabel}
                isDigits={payForm.isCheckNoDigits}
                control={control}
                error={checkNoError}
                isDisabled={isDisabled}
                style={widths.checkNo}
            />
        </View>
    )
}
