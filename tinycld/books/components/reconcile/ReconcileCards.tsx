import { Pressable, Text, View } from 'react-native'
import type { ReconcileLineRow } from '../../hooks/useReconcileLines'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { dateOrderText, RECONCILE_TEXTS, signedLineText } from '../../lib/reconcile'
import { formatDay } from '../../lib/register-range'
import { useReconcileStore } from '../../stores/reconcile-store'
import { ListCards } from '../ListCards'
import {
    LINE_CARD_HEIGHT,
    LineBox,
    LineLink,
    MatchedMark,
    rowPressOf,
    SelectAllBox,
    useLineFocus,
} from './ReconcileRow'

const BAR_STYLE = { minHeight: 44 }
const CARD_STYLE = { height: LINE_CARD_HEIGHT }

function ignore() {}

function lineKey(row: ReconcileLineRow): string {
    return row.id
}

function lineCardHeight(): number {
    return LINE_CARD_HEIGHT
}

function cardFirstLine(row: ReconcileLineRow): string {
    return row.payee ? ` · ${row.payee}` : ''
}

function cardSecondLine(row: ReconcileLineRow): string {
    const day = formatDay(row.date)
    return row.memo ? `${day} · ${row.memo}` : day
}

// One transaction on a phone or a narrow list: the clear box (a reader: the check mark of
// a cleared row) · "Expense 12 · Robertson & Associates" and "Oct 12, 2026 · Retainer for
// October" · the amount signed by its effect on the balance. A press anywhere but the
// link clears or unclears it.
function ReconcileCard({ row, model }: { row: ReconcileLineRow; model: ReconcileScreenModel }) {
    const press = rowPressOf(model, row)
    const focus = useLineFocus(row.id === model.focusedLineId)
    const className = `flex-row items-center gap-2 border-b border-border pr-1 ${press.background}`
    const style = [CARD_STYLE, focus.style]
    const role = press.canPress ? 'button' : undefined
    const isCardDisabled = !press.canPress || press.isDisabled
    const firstLine = cardFirstLine(row)
    const secondLine = cardSecondLine(row)
    const amount = signedLineText(row, model.accountType, model.currency)
    return (
        <Pressable
            testID={`reconcile-row-${row.id}`}
            accessibilityRole={role}
            accessibilityHint={press.hint}
            disabled={isCardDisabled}
            onPress={press.onPress}
            className={className}
            style={style}
            dataSet={focus.dataSet}
        >
            <LineBox row={row} model={model} />
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-1.5">
                    <LineLink row={row} />
                    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
                        {firstLine}
                    </Text>
                    <MatchedMark isVisible={row.bank_matched} />
                </View>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {secondLine}
                </Text>
            </View>
            <Text className="text-sm font-semibold tabular-nums text-foreground">{amount}</Text>
        </Pressable>
    )
}

// A reader has no "Clear all shown": an empty slot keeps the order toggle on the right.
function PhoneSelectAll({ model }: { model: ReconcileScreenModel }) {
    if (!model.canWrite) return <View />
    return <SelectAllBox model={model} text={RECONCILE_TEXTS.clearAllShown} />
}

// Above the cards: "Clear all shown" on the left, the date order in words on the right.
function PhoneListBar({ model }: { model: ReconcileScreenModel }) {
    const toggleSort = useReconcileStore(s => s.toggleSort)
    const text = dateOrderText(model.sort)
    const value = { text }
    const onToggle = () => toggleSort('date')
    return (
        <View
            testID="reconcile-phone-bar"
            className="flex-row items-center justify-between border-b border-border"
            style={BAR_STYLE}
        >
            <PhoneSelectAll model={model} />
            <Pressable
                testID="reconcile-sort-date"
                accessibilityRole="button"
                accessibilityLabel="Sort by date"
                accessibilityValue={value}
                onPress={onToggle}
                className="justify-center px-1"
                style={BAR_STYLE}
            >
                <Text className="text-sm text-primary">{text}</Text>
            </Pressable>
        </View>
    )
}

/**
 * The work screen's list below the table's own minimum width (reconcile spec §3 "The list
 * (phone and narrow)"): the bar with "Clear all shown" and the order toggle, then the
 * windowed cards, 64 high. The keys scroll the focused card into view through the
 * screen's `listScrollRef`.
 */
export function ReconcileCards({ model }: { model: ReconcileScreenModel }) {
    const renderCard = (row: ReconcileLineRow) => <ReconcileCard row={row} model={model} />
    return (
        <View className="min-h-0 flex-1">
            <PhoneListBar model={model} />
            <ListCards
                testID="reconcile-cards"
                rows={model.shown}
                heightOf={lineCardHeight}
                keyOf={lineKey}
                renderCard={renderCard}
                onNearEnd={ignore}
                scrollHandle={model.listScrollRef}
            />
        </View>
    )
}
