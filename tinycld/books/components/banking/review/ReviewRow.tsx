import { rowFocusStyle } from '@tinycld/core/components/focusable-row'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Pressable, Text, View } from 'react-native'
import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import {
    REVIEW_CELLS,
    REVIEW_ROW_HEIGHT,
    txnAmountCells,
    txnPhoneLine,
    txnSecondLine,
} from '../../../lib/bank-review'
import { formatMoney } from '../../../lib/money'
import { PARTY_ROW_CLASS } from '../../../lib/party-list'
import { formatDay } from '../../../lib/register-range'
import { SelectBox } from '../../SelectBox'

const ROW_STYLE = { height: REVIEW_ROW_HEIGHT }
const AMOUNT_CLASS = 'text-right text-sm tabular-nums text-foreground'

function SecondLine({ text }: { text: string }) {
    if (!text) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

// The row's part in the choice; null where rows cannot be chosen (Reviewed, readers).
export type RowChoice = {
    isChosen: boolean
    isDisabled: boolean
    onToggle: (id: string) => void
} | null

export function rowChoiceOf(model: ReviewTabModel, id: string): RowChoice {
    if (!model.canChoose) return null
    return {
        isChosen: model.isChosen(id),
        isDisabled: model.isChoiceDisabled,
        onToggle: model.onToggle,
    }
}

type RowProps = {
    row: ReviewRowData
    currency: string
    isOpen: boolean
    // The review keys' focus stripe (web only, core rowFocusStyle).
    isFocused: boolean
    onOpen: (id: string) => void
    choice: RowChoice
}

// The register's focus stripe, and `data-focused` on the web for the e2e (react-native-web
// renders `dataSet`; a bare data- prop is dropped).
function useRowFocus(isFocused: boolean) {
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('primary')
    return {
        style: rowFocusStyle({ isFocused, borderColor, activeIndicator }),
        dataSet: { focused: isFocused ? 'true' : undefined },
    }
}

// The row's check box, on the cell the header's select-all uses. SelectBox stops its own
// press, so pressing it does not open the drawer.
function RowBox({ row, choice }: { row: ReviewRowData; choice: RowChoice }) {
    if (!choice) return null
    const state = choice.isChosen ? 'checked' : 'empty'
    const onPress = () => choice.onToggle(row.id)
    return (
        <View style={REVIEW_CELLS.check}>
            <SelectBox
                testID={`bank-review-check-${row.id}`}
                label={`Choose ${row.description}`}
                state={state}
                isDisabled={choice.isDisabled}
                onPress={onPress}
            />
        </View>
    )
}

// The open row is highlighted as the register's open row is.
function rowBackground(isOpen: boolean): string {
    return isOpen ? 'bg-accent' : 'bg-background'
}

// One transaction of the wide table: the check box (when rows can be chosen) · Date ·
// Description (memo and check number under it) · Spent · Received, on the cells the header
// uses. Pressing it opens the drawer. react-native-web writes no aria-selected from
// accessibilityState, so both are set.
export function ReviewRow({ row, currency, isOpen, isFocused, onOpen, choice }: RowProps) {
    const amounts = txnAmountCells(row.amount, currency)
    const secondLine = txnSecondLine(row.memo, row.checkNumber)
    const day = formatDay(row.date)
    const onPress = () => onOpen(row.id)
    const selected = { selected: isOpen }
    const className = `${PARTY_ROW_CLASS} border-b border-border ${rowBackground(isOpen)}`
    const focus = useRowFocus(isFocused)
    const style = [ROW_STYLE, focus.style]
    return (
        <Pressable
            testID={`bank-review-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={selected}
            aria-selected={isOpen}
            onPress={onPress}
            className={className}
            style={style}
            dataSet={focus.dataSet}
        >
            <RowBox row={row} choice={choice} />
            <View className="min-w-0 pr-3" style={REVIEW_CELLS.date}>
                <Text numberOfLines={1} className="text-sm tabular-nums text-foreground">
                    {day}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={REVIEW_CELLS.description}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.description}
                </Text>
                <SecondLine text={secondLine} />
            </View>
            <View className="min-w-0 pr-3" style={REVIEW_CELLS.spent}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {amounts.spent}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={REVIEW_CELLS.received}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {amounts.received}
                </Text>
            </View>
        </Pressable>
    )
}

// One transaction on a phone: the check box (when rows can be chosen), description and
// "day · Check n", then the signed amount on the right. Pressing it opens the drawer as a
// sheet.
export function ReviewCard({
    row,
    currency,
    height,
    isOpen,
    isFocused,
    onOpen,
    choice,
}: RowProps & { height: number }) {
    const focus = useRowFocus(isFocused)
    const cardStyle = [{ height }, focus.style]
    const phoneLine = txnPhoneLine(row.date, row.checkNumber)
    const amountText = formatMoney(row.amount, currency)
    const onPress = () => onOpen(row.id)
    const selected = { selected: isOpen }
    const className = `flex-row items-center gap-3 border-b border-border px-1 ${rowBackground(isOpen)}`
    return (
        <Pressable
            testID={`bank-review-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={selected}
            aria-selected={isOpen}
            onPress={onPress}
            className={className}
            style={cardStyle}
            dataSet={focus.dataSet}
        >
            <RowBox row={row} choice={choice} />
            <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.description}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {phoneLine}
                </Text>
            </View>
            <Text className="text-sm font-semibold tabular-nums text-foreground">{amountText}</Text>
        </Pressable>
    )
}
