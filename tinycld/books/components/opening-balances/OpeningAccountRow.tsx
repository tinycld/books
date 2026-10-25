import { Text, View } from 'react-native'
import type { OpeningForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningRow } from '../../lib/opening-balances'
import { accountDisplay } from '../accounts/account-display'
import { AmountError, MoneyInput, useAmountMessage } from '../MoneyInput'
import {
    AMOUNT_STYLE,
    DETAIL_STYLE,
    indentFor,
    NAME_STYLE,
    OPENING_ITEM_HEIGHT,
} from './opening-grid-style'

export function InactiveLabel({ id, isVisible }: { id: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID={`opening-inactive-${id}`} className="text-xs italic text-muted-foreground">
            Inactive
        </Text>
    )
}

export function HelperText({ id, text }: { id: string; text: string }) {
    if (!text) return null
    return (
        <Text testID={`opening-helper-${id}`} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

export function AccountTitle({ row }: { row: OpeningRow }) {
    return (
        <View className="min-w-0 flex-row items-baseline gap-2">
            <Text className="text-sm text-muted-foreground">{row.account.number}</Text>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
                {row.account.name}
            </Text>
        </View>
    )
}

// The amount error takes the helper line while it shows.
function RowNote({ row, message }: { row: OpeningRow; message: string }) {
    if (message) {
        return <AmountError message={message} testID={`opening-amount-error-${row.account.id}`} />
    }
    return (
        <View className="flex-row items-baseline gap-2">
            <InactiveLabel id={row.account.id} isVisible={row.isInactive} />
            <HelperText id={row.account.id} text={row.helper} />
        </View>
    )
}

export function OpeningAccountRow({ row, model }: { row: OpeningRow; model: OpeningForm }) {
    const { account } = row
    const { detailLabel } = accountDisplay(account.type, account.detail_type)
    const dim = row.isInactive ? 'opacity-60' : ''
    const { message } = useAmountMessage(model.form.control, account.id)
    return (
        <View
            testID={`opening-row-${account.id}`}
            className={`flex-row items-center gap-3 border-b border-border px-4 ${dim}`}
            style={{ height: OPENING_ITEM_HEIGHT.wide.row }}
        >
            <View className="gap-0.5" style={[NAME_STYLE, { paddingLeft: indentFor(row.depth) }]}>
                <AccountTitle row={row} />
                <RowNote row={row} message={message} />
            </View>
            <Text numberOfLines={1} style={DETAIL_STYLE} className="text-sm text-muted-foreground">
                {detailLabel}
            </Text>
            <View style={AMOUNT_STYLE}>
                <MoneyInput
                    control={model.form.control}
                    accountId={account.id}
                    accountLabel={`${account.number} ${account.name}`.trim()}
                    testID={`opening-amount-${account.id}`}
                    onSubmitEditing={() => model.focusNext(account.id)}
                    inputRef={model.inputRefFor(account.id)}
                />
            </View>
        </View>
    )
}
