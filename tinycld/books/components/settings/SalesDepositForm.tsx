import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary, SelectInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import type { useDepositAccounts } from '../../hooks/useDepositAccounts'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { rootErrorOnly } from '../../lib/root-errors'
import { salesDepositSettingOptions } from '../../lib/sales-settings'
import { salesDepositSchema, salesDepositValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote } from './SectionCard'

export const SALES_DEPOSIT_NOTE =
    'Ask shows Deposit to on every sales receipt. Choose an account to hide Deposit to and deposit every sale there.'

interface SalesDepositFormProps {
    settings: BooksSettings
    deposit: ReturnType<typeof useDepositAccounts>
}

/**
 * "Sales deposited to": "Ask", or the active bank or Undeposited funds account every
 * sales receipt deposits to. The select waits for the deposit accounts; the section shows
 * their load error with its Retry.
 */
export function SalesDepositForm({ settings, deposit }: SalesDepositFormProps) {
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: salesDepositSchema,
        values: salesDepositValues(settings),
        toPatch: values => ({ sales_deposit_account: values.sales_deposit_account }),
    })
    const { control, formState } = form
    const { errors, isSubmitted } = formState
    const { options, triggerLabel } = salesDepositSettingOptions(
        deposit.rows,
        settings.sales_deposit_account ?? ''
    )
    const isSelectDisabled = !deposit.isReady || deposit.isError
    const isSaveDisabled = !isDirty || isPending
    return (
        <View className="gap-4">
            <View className="w-full max-w-[360px]">
                <SelectInput
                    control={control}
                    name="sales_deposit_account"
                    label="Sales deposited to"
                    options={options}
                    placeholder={triggerLabel}
                    disabled={isSelectDisabled}
                    testID="books-settings-sales-deposit"
                />
            </View>
            <FieldNote text={SALES_DEPOSIT_NOTE} />
            <FormErrorSummary
                testID="books-settings-sales-deposit-errors"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <ServerActionButton
                    testID="books-settings-sales-deposit-save"
                    isDisabled={isSaveDisabled}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
