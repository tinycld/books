import { SelectInput } from '@tinycld/core/ui/form'
import { useFormContext, useFormState } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { useTransferAccounts } from '../../hooks/useTransferAccounts'
import { type TransferFormValues, transferBalanceLine } from '../../lib/transfer'

interface BalanceProps {
    side: 'from' | 'to'
    accounts: ReturnType<typeof useTransferAccounts>
    storedId: string
    currency: string
}

// The account's own posted balance, the Chart of Accounts figure: not as of the transfer
// date, and not the balance after it.
function BalanceLine({ side, accounts, storedId, currency }: BalanceProps) {
    if (!storedId) return null
    // undefined: the account's row is not loaded yet. null: its balance is not exact, and
    // `?? 0` would print that as 0.00.
    const balance = accounts.balanceOf(storedId)
    const { text, isAlert } = transferBalanceLine(balance === undefined ? 0 : balance, currency)
    const tone = isAlert ? 'text-danger' : 'text-muted-foreground'
    return (
        <Text testID={`transfer-balance-${side}`} className={`text-sm tabular-nums ${tone}`}>
            {text}
        </Text>
    )
}

// The server's refusal of this side's line ("Line 1" is From, "Line 2" is To), set as the
// root error `root.<side>` so field validation does not clear it.
function LineRefusal({ side }: { side: 'from' | 'to' }) {
    const { control } = useFormContext<TransferFormValues>()
    const { errors } = useFormState({ control })
    const message = errors.root?.[side]?.message
    if (!message) return null
    return (
        <Text testID={`transfer-refusal-${side}`} className="pt-1 text-xs text-danger">
            {message}
        </Text>
    )
}

interface TransferAccountFieldProps extends BalanceProps {
    label: string
    isWide: boolean
    // Focuses the trigger once when the form opens, without opening its menu (web only;
    // core SelectInput does nothing with it on native).
    autoFocus?: boolean
}

// Wide, the two fields share the row; on a phone they stack, where flex-1 would let the
// column squeeze the field below its content (an error then runs into the next label).
export function TransferAccountField({
    side,
    label,
    accounts,
    storedId,
    isWide,
    currency,
    autoFocus = false,
}: TransferAccountFieldProps) {
    const { control } = useFormContext<TransferFormValues>()
    // A stored account the list no longer offers (inactive, or retyped) shows by name.
    const { options, triggerLabel } = accounts.optionsFor(storedId)
    return (
        <View className={isWide ? 'min-w-0 flex-1' : 'min-w-0'}>
            <SelectInput
                name={side}
                control={control}
                label={label}
                options={options}
                placeholder={triggerLabel || 'Choose an account'}
                testID={`transfer-${side}`}
                wrapperProps={{ style: { marginBottom: 4 } }}
                autoFocus={autoFocus}
            />
            <BalanceLine side={side} accounts={accounts} storedId={storedId} currency={currency} />
            <LineRefusal side={side} />
        </View>
    )
}
