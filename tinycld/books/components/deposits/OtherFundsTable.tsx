import { Text, View } from 'react-native'
import { DEPOSIT_LINE_COLUMNS } from '../../lib/deposit-columns'
import {
    LineAccountField,
    LineAmountField,
    LineDescriptionField,
    LinePartyField,
    lineHandlers,
    RemoveLineButton,
} from './OtherFundsLineFields'
import type { OtherFundsLinesProps } from './OtherFundsSection'

const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const COL = DEPOSIT_LINE_COLUMNS

type LineRowProps = Omit<OtherFundsLinesProps, 'fields'> & { id: string; index: number }

function LineRow({
    id,
    index,
    control,
    accounts,
    depositTo,
    currency,
    isDisabled,
    lineFocus,
}: LineRowProps) {
    const field = { control, index, isDisabled }
    const handlers = lineHandlers(lineFocus, id, index)
    return (
        <View
            testID={`deposit-line-${index}`}
            className="flex-row items-start gap-3 border-b border-border px-2 py-1"
            onFocus={handlers.onFocus}
            onBlur={handlers.onBlur}
        >
            <View style={COL.party}>
                <LinePartyField {...field} triggerRef={handlers.partyRef} />
            </View>
            <View style={COL.account}>
                <LineAccountField {...field} accounts={accounts} depositTo={depositTo} />
            </View>
            <View style={COL.description}>
                <LineDescriptionField {...field} />
            </View>
            <View style={COL.amount}>
                <LineAmountField {...field} currency={currency} onNext={handlers.onNext} />
            </View>
            <RemoveLineButton index={index} isDisabled={isDisabled} onPress={handlers.onRemove} />
        </View>
    )
}

/**
 * The other funds lines as a table (bank deposit spec §3.5), at or above its least width
 * (`depositLinesMinWidth`): the header row and one row per line, Received from, Account,
 * Description, Amount and Remove, every column from DEPOSIT_LINE_COLUMNS so it lines up
 * from the header down. The columns flex above their least widths, so it never scrolls
 * sideways.
 */
export function OtherFundsTable({ fields, ...line }: OtherFundsLinesProps) {
    const rows = fields.map((row, index) => (
        <LineRow key={row.key} id={row.id} index={index} {...line} />
    ))
    return (
        <View testID="deposit-lines-table">
            <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
                <Text className={HEAD} style={COL.party}>
                    Received from
                </Text>
                <Text className={HEAD} style={COL.account}>
                    Account
                </Text>
                <Text className={HEAD} style={COL.description}>
                    Description
                </Text>
                <Text className={`${HEAD} text-right`} style={COL.amount}>
                    Amount
                </Text>
                <View style={COL.remove} />
            </View>
            {rows}
        </View>
    )
}
