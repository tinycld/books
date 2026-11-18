import { SelectInput, TextInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { ReactNode } from 'react'
import { useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { PaymentFormState } from '../../hooks/usePaymentForm'
import type { PaymentBandWidths, PaymentFlow } from '../../lib/payment-flow'
import { paymentMethodOptions } from '../../lib/payment-methods'
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

type FieldWidth = { width: number } | undefined

// A phone stacks the fields at full width.
function widthsOf(
    widths: PaymentBandWidths,
    isPhone: boolean
): Record<keyof PaymentBandWidths, FieldWidth> {
    const of = (width: number): FieldWidth => (isPhone ? undefined : { width })
    return {
        party: of(widths.party),
        date: of(widths.date),
        method: of(widths.method),
        reference: of(widths.reference),
        account: of(widths.account),
        amount: of(widths.amount),
    }
}

// The date: core DateField, whose input the party pick focuses.
function PaymentDateInput({
    control,
    dateRef,
    isDisabled,
    autoFocus,
    label,
    testID,
    onChanged,
}: {
    control: PaymentFormState['form']['control']
    dateRef: PaymentFormState['dateRef']
    isDisabled: boolean
    autoFocus: boolean
    label: string
    testID: string
    // After the field took the value: the form checks what depends on the date.
    onChanged: () => void
}) {
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => {
        field.onChange(next ?? '')
        onChanged()
    }
    return (
        <DateField
            value={field.value}
            onChange={handleChange}
            withTime={false}
            disabled={isDisabled}
            autoFocus={autoFocus}
            accessibilityLabel={label}
            testID={testID}
            inputRef={dateRef}
        />
    )
}

// The amount is controlled by value (its typing re-spreads the rows); the form's field ref
// is passed to the input, so a refused submit focuses it.
function useAmountFieldRef(control: PaymentFormState['form']['control']) {
    const { field } = useController({ control, name: 'amount' })
    return field.ref
}

interface PaymentBandProps {
    flow: PaymentFlow
    paymentForm: PaymentFormState
    // The party and account fields the flow's screen built.
    partyField: ReactNode
    accountField: ReactNode
    isPhone: boolean
    // A save runs: the fields wait for it.
    isDisabled: boolean
    // The date takes the first focus on web (a correction whose party cannot change).
    isDateFirst: boolean
}

/**
 * The band (spec §3.2): the party and the date, then Payment method, Reference no. and the
 * account; the amount in the right column on a wide screen and last on a phone. The amount
 * comes after the account in the tree on every width, so Tab reaches it there. The flow
 * gives the labels, the test ids and the wide widths.
 */
export function PaymentBand({
    flow,
    paymentForm,
    partyField,
    accountField,
    isPhone,
    isDisabled,
    isDateFirst,
}: PaymentBandProps) {
    const { form, values, dateRef, onAmountTyped } = paymentForm
    const { control, formState } = form
    const amountRef = useAmountFieldRef(control)
    const errors = formState.errors
    const { texts, testId } = flow
    // Wide, a row's fields wrap to the next line when the band is narrower than they are,
    // so the form never scrolls sideways.
    const row = isPhone ? 'gap-3' : 'flex-row flex-wrap items-start gap-4'
    const outer = isPhone ? 'gap-4' : 'flex-row items-start justify-between gap-4'
    const width = widthsOf(flow.widths, isPhone)
    const dateError = errors.date?.message ?? ''
    const amountError = errors.amount?.message ?? ''
    return (
        <View testID={`${testId}-band`} className={`${BAND} ${outer}`}>
            <View className="min-w-0 shrink gap-4">
                <View className={row}>
                    <Field label={texts.partyLabel} style={width.party}>
                        {partyField}
                    </Field>
                    <Field label={texts.dateLabel} style={width.date}>
                        <PaymentDateInput
                            control={control}
                            dateRef={dateRef}
                            isDisabled={isDisabled}
                            autoFocus={isDateFirst}
                            label={texts.dateLabel}
                            testID={`${testId}-date`}
                            onChanged={paymentForm.onDateChanged}
                        />
                        <FieldError message={dateError} testID={`${testId}-date-error`} />
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
                            testID={`${testId}-method`}
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
                            testID={`${testId}-reference`}
                        />
                    </View>
                    <View style={width.account}>{accountField}</View>
                </View>
            </View>
            <Field label={texts.amountLabel} style={width.amount}>
                <PaymentMoneyField
                    value={values.amount}
                    onChangeText={onAmountTyped}
                    testID={`${testId}-amount`}
                    accessibilityLabel={texts.amountLabel}
                    error={amountError}
                    errorTestID={`${testId}-amount-error`}
                    inputRef={amountRef}
                    isDisabled={isDisabled}
                    isLast
                />
            </Field>
        </View>
    )
}
