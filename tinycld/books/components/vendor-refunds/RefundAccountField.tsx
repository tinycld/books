import { SelectInput, type SelectOption } from '@tinycld/core/ui/form'
import { type Control, useWatch } from 'react-hook-form'
import { View } from 'react-native'
import { PaidFromBalance } from '../../forms/payment-fields'
import type { PaymentFormValues } from '../../lib/payment-values'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'
import { FieldError } from '../payments/PaymentMoneyField'

// The select's text when the chart lists no refund account (spec §3.3).
export const NO_REFUND_ACCOUNT_TEXT = 'Add a bank or credit card account to the chart of accounts'

interface RefundAccountFieldProps {
    control: Control<PaymentFormValues>
    // refundAccountOptions' options and the stored inactive account's name.
    options: SelectOption[]
    triggerLabel: string
    // The listed account's posted balance by id, from the screen's account read.
    balanceOf: (id: string) => number | null | undefined
    currency: string
    error: string
    isDisabled: boolean
}

const FLOW = VENDOR_REFUND_FLOW
const TEST_ID = `${FLOW.testId}-${FLOW.ids.account}`

function placeholderOf(options: readonly SelectOption[], triggerLabel: string): string {
    if (triggerLabel !== '') return triggerLabel
    return options.length === 0 ? NO_REFUND_ACCOUNT_TEXT : ''
}

/**
 * Refunded to (vendor refund spec §3.3, Q3): core SelectInput over the active bank, credit
 * card and Undeposited funds accounts in chart order, indented by depth; with none listed,
 * the select reads "Add a bank or credit card account to the chart of accounts". Under it,
 * once picked, the account's posted balance (PaidFromBalance, danger when negative) from
 * the screen's account read (`balanceOf`), and the field's error. The screen loads the
 * accounts before the form mounts and shows their load error with Retry.
 */
export function RefundAccountField({
    control,
    options,
    triggerLabel,
    balanceOf,
    currency,
    error,
    isDisabled,
}: RefundAccountFieldProps) {
    const accountId = useWatch({ control, name: 'account' })
    const placeholder = placeholderOf(options, triggerLabel)
    return (
        <View>
            <SelectInput
                name="account"
                control={control}
                label={FLOW.texts.accountLabel}
                options={options}
                placeholder={placeholder}
                disabled={isDisabled}
                hideError
                testID={TEST_ID}
            />
            <PaidFromBalance
                accountId={accountId}
                balanceOf={balanceOf}
                currency={currency}
                testID={`${FLOW.testId}-${FLOW.ids.accountBalance}`}
            />
            <FieldError message={error} testID={`${TEST_ID}-error`} />
        </View>
    )
}
