import { Text, View } from 'react-native'
import type { OpeningForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningRow } from '../../lib/opening-balances'
import { accountDisplay } from '../accounts/account-display'
import { AmountError, MoneyInput, useAmountMessage } from '../MoneyInput'
import { AccountTitle, HelperText, InactiveLabel } from './OpeningAccountRow'
import { indentFor, OPENING_ITEM_HEIGHT } from './opening-grid-style'

// The amount error takes the helper line while it shows.
function CardNote({ row, message }: { row: OpeningRow; message: string }) {
    if (message) {
        return <AmountError message={message} testID={`opening-amount-error-${row.account.id}`} />
    }
    return <HelperText id={row.account.id} text={row.helper} />
}

// The wrapper is the full item height; the card inside leaves a small gap between cards.
export function OpeningAccountCard({ row, model }: { row: OpeningRow; model: OpeningForm }) {
    const { account } = row
    const { typeLabel } = accountDisplay(account.type, account.detail_type)
    const dim = row.isInactive ? 'opacity-60' : ''
    const { message } = useAmountMessage(model.form.control, account.id)
    return (
        <View className="justify-center px-4" style={{ height: OPENING_ITEM_HEIGHT.phone.row }}>
            <View
                testID={`opening-card-${account.id}`}
                className={`gap-0.5 rounded-lg border border-border bg-background p-2 ${dim}`}
            >
                <View style={{ paddingLeft: indentFor(row.depth) }}>
                    <AccountTitle row={row} />
                </View>
                <View
                    className="flex-row items-baseline gap-2"
                    style={{ paddingLeft: indentFor(row.depth) }}
                >
                    <Text className="text-xs text-muted-foreground">{typeLabel}</Text>
                    <InactiveLabel id={account.id} isVisible={row.isInactive} />
                </View>
                <MoneyInput
                    control={model.form.control}
                    accountId={account.id}
                    accountLabel={`${account.number} ${account.name}`.trim()}
                    testID={`opening-amount-${account.id}`}
                    onSubmitEditing={() => model.focusNext(account.id)}
                    inputRef={model.inputRefFor(account.id)}
                />
                <CardNote row={row} message={message} />
            </View>
        </View>
    )
}
