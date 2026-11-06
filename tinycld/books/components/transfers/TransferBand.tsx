import { TextInput } from '@tinycld/core/ui/form'
import { useFormContext } from 'react-hook-form'
import { View } from 'react-native'
import type { useTransferAccounts } from '../../hooks/useTransferAccounts'
import { formatAmountOnBlur } from '../../lib/entry-lines'
import { type TransferFormValues, transferAmountError } from '../../lib/transfer'
import { FlowArrow } from './FlowArrow'
import { TransferAccountField } from './TransferAccountField'
import { TransferDateField } from './TransferDateField'

interface TransferBandProps {
    isWide: boolean
    accounts: ReturnType<typeof useTransferAccounts>
    values: TransferFormValues
    currency: string
}

function AccountPair({ isWide, accounts, values, currency }: TransferBandProps) {
    const layout = isWide ? 'min-w-0 flex-1 flex-row items-start gap-3' : ''
    return (
        <View className={layout}>
            <TransferAccountField
                side="from"
                label="Transfer from"
                accounts={accounts}
                storedId={values.from}
                isWide={isWide}
                currency={currency}
                autoFocus
            />
            <FlowArrow isWide={isWide} isInForm />
            <TransferAccountField
                side="to"
                label="Transfer to"
                accounts={accounts}
                storedId={values.to}
                isWide={isWide}
                currency={currency}
            />
        </View>
    )
}

// Only an amount the schema accepts is rewritten on blur. formatAmountOnBlur turns a typed
// 0 into blank text, which would swap "more than 0" for the "like 1,234.50" message.
function useAmountBlur(currency: string) {
    const { getValues, setValue } = useFormContext<TransferFormValues>()
    return () => {
        const text = getValues('amount')
        if (transferAmountError(text, currency) !== null) return
        const formatted = formatAmountOnBlur(text, currency)
        if (formatted !== text) setValue('amount', formatted, { shouldDirty: true })
    }
}

// One band for what moves the money: the two accounts, the amount and the date.
export function TransferBand({ isWide, accounts, values, currency }: TransferBandProps) {
    const { control } = useFormContext<TransferFormValues>()
    const onAmountBlur = useAmountBlur(currency)
    const layout = isWide ? 'flex-row items-start gap-6' : 'gap-3'
    const sideStyle = isWide ? { width: 260 } : undefined
    return (
        <View
            testID="transfer-band"
            className={`rounded-xl border border-border bg-surface-secondary p-4 ${layout}`}
        >
            <AccountPair isWide={isWide} accounts={accounts} values={values} currency={currency} />
            <View style={sideStyle}>
                <TextInput
                    name="amount"
                    control={control}
                    label="Amount"
                    keyboardType="decimal-pad"
                    testID="transfer-amount-input"
                    onBlur={onAmountBlur}
                />
                <TransferDateField />
            </View>
        </View>
    )
}
