import { Pressable, Text, View } from 'react-native'
import type { DepositFormItem } from '../../lib/deposit'
import { DEPOSIT_ITEM_COLUMNS } from '../../lib/deposit-columns'
import { SelectBox, type SelectBoxState } from '../SelectBox'
import { ItemLink, type ItemListActions, MutedLine, RowError } from './UndepositedGrid'

const CARD = 'gap-1 rounded-xl border border-border p-3'
// The body lines start under the party: the tick box's width and the first line's gap.
const BODY_INDENT = { paddingLeft: DEPOSIT_ITEM_COLUMNS.tick.width + 4 }

function ItemCard({ row, actions }: { row: DepositFormItem; actions: ItemListActions }) {
    const tint = row.isTicked ? 'bg-accent' : 'bg-background'
    const state: SelectBoxState = row.isTicked ? 'checked' : 'empty'
    const toggle = () => actions.onToggle(row.line)
    const linkText = `${row.label} · ${row.date}`
    return (
        <Pressable
            testID={`deposit-item-${row.line}`}
            onPress={toggle}
            disabled={actions.isDisabled}
            tabIndex={-1}
            className={`${CARD} ${tint}`}
        >
            <View className="flex-row items-center gap-1">
                <SelectBox
                    state={state}
                    label={`Deposit ${row.label}`}
                    testID={`deposit-item-tick-${row.line}`}
                    isDisabled={actions.isDisabled}
                    onPress={toggle}
                />
                <Text
                    className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                    numberOfLines={1}
                >
                    {row.party}
                </Text>
                <Text className={`text-sm font-semibold tabular-nums ${row.tone}`}>
                    {row.amount}
                </Text>
            </View>
            <View className="min-w-0" style={BODY_INDENT}>
                <ItemLink
                    text={linkText}
                    href={row.href}
                    testID={`deposit-item-link-${row.line}`}
                    onOpen={actions.onOpenLink}
                />
                <MutedLine text={row.account} />
                <MutedLine text={row.payment} />
            </View>
            <RowError message={row.error} testID={`deposit-item-error-${row.line}`} />
        </Pressable>
    )
}

interface UndepositedCardsProps {
    rows: DepositFormItem[]
    tickAll: SelectBoxState
    actions: ItemListActions
}

/**
 * The items as cards (bank deposit spec §3.4), below the grid's least width: tick box,
 * Received from and the amount on the first line, then "Payment 1004 · Oct 3, 2026" as the
 * link and the payment text. The whole card is its tick's press target. "Select all" over
 * the cards does what the grid's header box does (lesson 28).
 */
export function UndepositedCards({ rows, tickAll, actions }: UndepositedCardsProps) {
    const drawn = rows.map(row => <ItemCard key={row.line} row={row} actions={actions} />)
    return (
        <View testID="deposit-items-cards" className="gap-3">
            <SelectBox
                state={tickAll}
                label="Select all items"
                text="Select all"
                testID="deposit-tick-all"
                isDisabled={actions.isDisabled}
                onPress={actions.onTickAll}
                tabIndex={-1}
            />
            {drawn}
        </View>
    )
}
