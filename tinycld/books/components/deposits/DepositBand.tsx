import { SelectInput, type SelectOption } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import { PaidFromBalance } from '../../forms/payment-fields'
import type { DepositForm } from '../../hooks/useDepositForm'
import { DEPOSIT_MESSAGES } from '../../lib/deposit-texts'
import { FieldError } from '../payments/PaymentMoneyField'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const ACCOUNT_WIDE = { width: 320 }
const DATE_WIDE = { width: 200 }

type DepositControl = DepositForm['form']['control']

function DepositDateInput({
    control,
    isDisabled,
}: {
    control: DepositControl
    isDisabled: boolean
}) {
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    return (
        <DateField
            value={field.value}
            onChange={handleChange}
            withTime={false}
            disabled={isDisabled}
            accessibilityLabel="Deposit date"
            testID="deposit-date"
        />
    )
}

interface DepositBandProps {
    depositForm: DepositForm
    // Deposit to's options (lib/deposit-accounts.ts `bankAccountOptions`) and the text
    // its trigger shows for a stored account the options leave out.
    options: SelectOption[]
    triggerLabel: string
    balanceOf: (id: string) => number | null | undefined
    currency: string
    isPhone: boolean
    // A save runs: the fields wait for it.
    isDisabled: boolean
    // Deposit to takes the first focus (web only, spec §3.2).
    hasFocusOnOpen: boolean
}

/**
 * The band (bank deposit spec §3.3): Deposit to, with the picked account's balance under
 * it, and Deposit date. With no bank account in the chart the select is empty and says
 * so. The fields wrap when the band is narrower than they are, and stack on a phone.
 */
export function DepositBand({
    depositForm,
    options,
    triggerLabel,
    balanceOf,
    currency,
    isPhone,
    isDisabled,
    hasFocusOnOpen,
}: DepositBandProps) {
    const { form, values } = depositForm
    const placeholder = options.length === 0 ? DEPOSIT_MESSAGES.noBankAccount : triggerLabel
    const row = isPhone ? 'gap-3' : 'flex-row flex-wrap items-start gap-4'
    const accountWidth = isPhone ? undefined : ACCOUNT_WIDE
    const dateWidth = isPhone ? undefined : DATE_WIDE
    const dateError = form.formState.errors.date?.message ?? ''
    return (
        <View testID="deposit-band" className={`${BAND} ${row}`}>
            <View className="min-w-0" style={accountWidth}>
                <SelectInput
                    name="deposit_to"
                    control={form.control}
                    label="Deposit to"
                    options={options}
                    placeholder={placeholder}
                    disabled={isDisabled}
                    autoFocus={hasFocusOnOpen}
                    testID="deposit-to"
                />
                <PaidFromBalance
                    accountId={values.deposit_to}
                    balanceOf={balanceOf}
                    currency={currency}
                    testID="deposit-to-balance"
                />
            </View>
            <View className="min-w-0" style={dateWidth}>
                <Text className="mb-1 text-sm font-semibold text-foreground">Deposit date</Text>
                <DepositDateInput control={form.control} isDisabled={isDisabled} />
                <FieldError message={dateError} testID="deposit-date-error" />
            </View>
        </View>
    )
}
