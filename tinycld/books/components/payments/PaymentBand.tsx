import { SelectInput, type SelectOption, TextInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { ReactNode } from 'react'
import { useController } from 'react-hook-form'
import { Platform, Text, View } from 'react-native'
import type { PaymentFormState } from '../../hooks/usePaymentForm'
import { paymentMethodOptions } from '../../lib/payment-methods'
import { PaymentCustomerField } from './PaymentCustomerField'
import { FieldError, PaymentMoneyField } from './PaymentMoneyField'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const METHOD_OPTIONS = paymentMethodOptions({ allowNone: true })

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
    return (
        <View className="min-w-0" style={style}>
            <Text className="mb-1 text-sm font-semibold text-foreground">{label}</Text>
            {children}
        </View>
    )
}

const WIDE_WIDTHS = {
    customer: { width: 320 },
    date: { width: 180 },
    method: { width: 180 },
    reference: { width: 220 },
    deposit: { width: 300 },
    amount: { width: 200 },
} as const

const PHONE_WIDTHS = {
    customer: undefined,
    date: undefined,
    method: undefined,
    reference: undefined,
    deposit: undefined,
    amount: undefined,
} as const

// A phone stacks the fields at full width.
function widthsOf(isPhone: boolean) {
    return isPhone ? PHONE_WIDTHS : WIDE_WIDTHS
}

// Payment date: core DateField, whose input the customer pick focuses.
function PaymentDateInput({
    control,
    dateRef,
    isDisabled,
    autoFocus,
}: {
    control: PaymentFormState['form']['control']
    dateRef: PaymentFormState['dateRef']
    isDisabled: boolean
    autoFocus: boolean
}) {
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    return (
        <DateField
            value={field.value}
            onChange={handleChange}
            withTime={false}
            disabled={isDisabled}
            autoFocus={autoFocus}
            accessibilityLabel="Payment date"
            testID="payment-date"
            inputRef={dateRef}
        />
    )
}

// Amount received is controlled by value (its typing re-spreads the rows); the form's
// field ref is passed to the input, so a refused submit focuses it.
function useAmountFieldRef(control: PaymentFormState['form']['control']) {
    const { field } = useController({ control, name: 'amount' })
    return field.ref
}

interface PaymentBandProps {
    paymentForm: PaymentFormState
    depositOptions: SelectOption[]
    // The stored inactive account's name, shown while the value is not an option.
    depositTriggerLabel: string
    isPhone: boolean
    // A save runs: the fields wait for it.
    isDisabled: boolean
    // A correction keeps its customer: Customer cannot open, and Payment date takes the
    // first focus on web.
    isCustomerLocked: boolean
}

const AUTO_FOCUS = Platform.OS === 'web'

/**
 * The band (spec §3.2): Customer and Payment date, then Payment method, Reference no. and
 * Deposit to; Amount received in the right column on a wide screen and last on a phone.
 * Amount received comes after Deposit to in the tree on every width, so Tab reaches it
 * there.
 */
export function PaymentBand({
    paymentForm,
    depositOptions,
    depositTriggerLabel,
    isPhone,
    isDisabled,
    isCustomerLocked,
}: PaymentBandProps) {
    const { form, values, customerName, dateRef, onCustomerPicked, onAmountTyped, focusDate } =
        paymentForm
    const { control, formState } = form
    const amountRef = useAmountFieldRef(control)
    const errors = formState.errors
    // Wide, a row's fields wrap to the next line when the band is narrower than they are,
    // so the form never scrolls sideways.
    const row = isPhone ? 'gap-3' : 'flex-row flex-wrap items-start gap-4'
    const outer = isPhone ? 'gap-4' : 'flex-row items-start justify-between gap-4'
    const width = widthsOf(isPhone)
    const customerError = errors.customer?.message ?? ''
    const dateError = errors.date?.message ?? ''
    const amountError = errors.amount?.message ?? ''
    const pickCustomer = (id: string) => {
        void onCustomerPicked(id)
    }
    const isCustomerDisabled = isDisabled || isCustomerLocked
    const focusDateFirst = AUTO_FOCUS && isCustomerLocked
    return (
        <View testID="payment-band" className={`${BAND} ${outer}`}>
            <View className="min-w-0 shrink gap-4">
                <View className={row}>
                    <Field label="Customer" style={width.customer}>
                        <PaymentCustomerField
                            value={values.customer}
                            name={customerName}
                            error={customerError}
                            isDisabled={isCustomerDisabled}
                            hasFocusOnOpen={!isCustomerLocked}
                            onPick={pickCustomer}
                            onPicked={focusDate}
                        />
                    </Field>
                    <Field label="Payment date" style={width.date}>
                        <PaymentDateInput
                            control={control}
                            dateRef={dateRef}
                            isDisabled={isDisabled}
                            autoFocus={focusDateFirst}
                        />
                        <FieldError message={dateError} testID="payment-date-error" />
                    </Field>
                </View>
                <View className={`${row} border-t border-border pt-4`}>
                    <View style={width.method}>
                        <SelectInput
                            name="payment_method"
                            control={control}
                            label="Payment method"
                            options={METHOD_OPTIONS}
                            disabled={isDisabled}
                            testID="payment-method"
                        />
                    </View>
                    <View style={width.reference}>
                        <TextInput
                            name="reference_no"
                            control={control}
                            label="Reference no."
                            placeholder="Check or reference no."
                            maxLength={40}
                            editable={!isDisabled}
                            testID="payment-reference"
                        />
                    </View>
                    <View style={width.deposit}>
                        <SelectInput
                            name="deposit_to"
                            control={control}
                            label="Deposit to"
                            options={depositOptions}
                            placeholder={depositTriggerLabel}
                            disabled={isDisabled}
                            testID="payment-deposit-to"
                        />
                    </View>
                </View>
            </View>
            <Field label="Amount received" style={width.amount}>
                <PaymentMoneyField
                    value={values.amount}
                    onChangeText={onAmountTyped}
                    testID="payment-amount"
                    accessibilityLabel="Amount received"
                    error={amountError}
                    errorTestID="payment-amount-error"
                    inputRef={amountRef}
                    isDisabled={isDisabled}
                    isLast
                />
            </Field>
        </View>
    )
}
