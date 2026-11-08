import { Pressable, Text, View } from 'react-native'
import type { ReviewRowData } from '../../../hooks/useReviewTab'
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

type RowProps = {
    row: ReviewRowData
    currency: string
    isOpen: boolean
    onOpen: (id: string) => void
}

// The open row is highlighted as the register's open row is.
function rowBackground(isOpen: boolean): string {
    return isOpen ? 'bg-accent' : 'bg-background'
}

// One transaction of the wide table: Date · Description (memo and check number under it)
// · Spent · Received, on the cells the header uses. Pressing it opens the drawer.
// react-native-web writes no aria-selected from accessibilityState, so both are set.
export function ReviewRow({ row, currency, isOpen, onOpen }: RowProps) {
    const amounts = txnAmountCells(row.amount, currency)
    const secondLine = txnSecondLine(row.memo, row.checkNumber)
    const day = formatDay(row.date)
    const onPress = () => onOpen(row.id)
    const selected = { selected: isOpen }
    const className = `${PARTY_ROW_CLASS} border-b border-border ${rowBackground(isOpen)}`
    return (
        <Pressable
            testID={`bank-review-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={selected}
            aria-selected={isOpen}
            onPress={onPress}
            className={className}
            style={ROW_STYLE}
        >
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

// One transaction on a phone: description and "day · Check n" on the left, the signed
// amount on the right. Pressing it opens the drawer as a sheet.
export function ReviewCard({
    row,
    currency,
    height,
    isOpen,
    onOpen,
}: RowProps & { height: number }) {
    const cardStyle = { height }
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
        >
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
