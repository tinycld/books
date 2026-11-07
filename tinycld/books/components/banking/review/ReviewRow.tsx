import { Text, View } from 'react-native'
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

// One transaction of the wide table: Date · Description (memo and check number under it)
// · Spent · Received, on the cells the header uses.
export function ReviewRow({ row, currency }: { row: ReviewRowData; currency: string }) {
    const amounts = txnAmountCells(row.amount, currency)
    const secondLine = txnSecondLine(row.memo, row.checkNumber)
    const day = formatDay(row.date)
    return (
        <View
            testID={`bank-review-row-${row.id}`}
            className={`${PARTY_ROW_CLASS} border-b border-border`}
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
        </View>
    )
}

// One transaction on a phone: description and "day · Check n" on the left, the signed
// amount on the right.
export function ReviewCard({
    row,
    currency,
    height,
}: {
    row: ReviewRowData
    currency: string
    height: number
}) {
    const cardStyle = { height }
    const phoneLine = txnPhoneLine(row.date, row.checkNumber)
    const amountText = formatMoney(row.amount, currency)
    return (
        <View
            testID={`bank-review-row-${row.id}`}
            className="flex-row items-center gap-3 border-b border-border px-1"
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
        </View>
    )
}
