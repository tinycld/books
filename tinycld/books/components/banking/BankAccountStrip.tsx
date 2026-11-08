import { Pressable, ScrollView, Text, View } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import { useStatementBalance } from '../../hooks/useStatementBalance'
import { PHONE_CARD_GAP, PHONE_CARD_WIDTH, useStripScroll } from '../../hooks/useStripScroll'
import { accountTypeDef } from '../../lib/account-types'
import {
    bankDetailsText,
    cardBalance,
    connectionLabel,
    waitingText,
} from '../../lib/bank-connections'
import { reviewCountText } from '../../lib/bank-review'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'

const WIDE_CARD_WIDTH = 280
// The strip takes the height of its cards only; the panel under it takes the rest of the
// column. A `grow-0` class does not reach the scroll view's own flex on web, so this is a
// style.
const STRIP_STYLE = { flexGrow: 0, flexShrink: 0 }
// Cards keep their own height instead of stretching to the strip's. The phone strip's
// scroll position is computed from its gap, so the gap is a style, not a class.
const PHONE_STRIP_STYLE = { gap: PHONE_CARD_GAP, alignItems: 'flex-start' as const }
const WIDE_STRIP_STYLE = { gap: 12, alignItems: 'flex-start' as const }

// The latest bank statement's balance under the In Books balance. With no statement (only
// CSV files, no file, still loading or a load error) the card draws no line and keeps no
// space for one.
function StatementLine({
    connectionId,
    accountType,
    currency,
}: {
    connectionId: string
    accountType: string
    currency: string
}) {
    const { statement } = useStatementBalance(connectionId, accountType)
    if (!statement) return null
    const amountTone = statement.cents < 0 ? 'text-danger' : 'text-foreground'
    const amountText = formatMoney(statement.cents, currency)
    const asOfText = `as of ${formatDay(statement.day)}`
    return (
        <View testID={`bank-statement-${connectionId}`}>
            <Text className="pt-1 text-xs text-muted-foreground">Bank statement</Text>
            <Text className={`text-base font-semibold tabular-nums ${amountTone}`}>
                {amountText}
            </Text>
            <Text className="text-xs text-muted-foreground">{asOfText}</Text>
        </View>
    )
}

interface BankAccountCardProps {
    row: BankConnectionRow
    currency: string
    isSelected: boolean
    width: number
    onSelect: (id: string) => void
}

export function BankAccountCard({
    row,
    currency,
    isSelected,
    width,
    onSelect,
}: BankAccountCardProps) {
    const border = isSelected ? 'border-primary' : 'border-border'
    const typeLabel = accountTypeDef(row.accountType)?.label ?? ''
    const details = bankDetailsText(row) || 'No bank details'
    const balance = cardBalance(row, currency)
    const balanceTone = balance.isNegative ? 'text-danger' : 'text-foreground'
    const waitingTone = row.waitingCount > 0 ? 'text-foreground' : 'text-muted-foreground'
    const waiting = waitingText(row.waitingCount)
    const reviewTone = reviewCountTone(row.reviewCount)
    const review = reviewCountText(row.reviewCount)
    const label = connectionLabel(row.accountNumber, row.accountName)
    const accessibilityState = { selected: isSelected }
    const cardStyle = { width, borderWidth: isSelected ? 2 : 1 }
    const onPress = () => onSelect(row.id)
    return (
        <Pressable
            testID={`bank-card-${row.id}`}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            // react-native-web writes no aria-selected from accessibilityState.
            aria-selected={isSelected}
            onPress={onPress}
            className={`gap-1 rounded-xl border bg-background p-4 ${border}`}
            style={cardStyle}
        >
            <Text numberOfLines={1} className="text-base font-semibold text-foreground">
                {label}
            </Text>
            <Text className="text-xs text-muted-foreground">{typeLabel}</Text>
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
                {details}
            </Text>
            <Text className="pt-2 text-xs text-muted-foreground">In Books</Text>
            <Text className={`text-xl font-semibold tabular-nums ${balanceTone}`}>
                {balance.text}
            </Text>
            <StatementLine
                connectionId={row.id}
                accountType={row.accountType}
                currency={currency}
            />
            <Text className={`text-sm ${waitingTone}`}>{waiting}</Text>
            <Text testID={`bank-review-count-${row.id}`} className={`text-sm ${reviewTone}`}>
                {review}
            </Text>
        </Pressable>
    )
}

// A phone card: the account, its In Books balance and what waits for review. The type,
// bank details, statement and waiting files are on the panel heading and the Files tab.
function CompactAccountCard({ row, currency, isSelected, width, onSelect }: BankAccountCardProps) {
    const border = isSelected ? 'border-primary' : 'border-border'
    const balance = cardBalance(row, currency)
    const balanceTone = balance.isNegative ? 'text-danger' : 'text-foreground'
    const reviewTone = reviewCountTone(row.reviewCount)
    const review = reviewCountText(row.reviewCount)
    const label = connectionLabel(row.accountNumber, row.accountName)
    const accessibilityState = { selected: isSelected }
    const cardStyle = { width, borderWidth: isSelected ? 2 : 1 }
    const onPress = () => onSelect(row.id)
    return (
        <Pressable
            testID={`bank-card-${row.id}`}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            // react-native-web writes no aria-selected from accessibilityState.
            aria-selected={isSelected}
            onPress={onPress}
            className={`gap-0.5 rounded-xl border bg-background px-3 py-2.5 ${border}`}
            style={cardStyle}
        >
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                {label}
            </Text>
            <Text className={`text-base font-semibold tabular-nums ${balanceTone}`}>
                {balance.text}
            </Text>
            <Text testID={`bank-review-count-${row.id}`} className={`text-xs ${reviewTone}`}>
                {review}
            </Text>
        </Pressable>
    )
}

function reviewCountTone(count: number): string {
    return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

interface BankAccountStripProps {
    rows: BankConnectionRow[]
    selectedId: string
    currency: string
    isWide: boolean
    onSelect: (id: string) => void
}

function PhoneStrip({ rows, selectedId, currency, onSelect }: BankAccountStripProps) {
    const selectedIndex = rows.findIndex(row => row.id === selectedId)
    const { scrollRef, onContentSizeChange } = useStripScroll(selectedIndex)
    const cards = rows.map(row => (
        <CompactAccountCard
            key={row.id}
            row={row}
            currency={currency}
            isSelected={row.id === selectedId}
            width={PHONE_CARD_WIDTH}
            onSelect={onSelect}
        />
    ))
    return (
        <ScrollView
            ref={scrollRef}
            testID="bank-strip"
            horizontal
            showsHorizontalScrollIndicator={false}
            style={STRIP_STYLE}
            contentContainerStyle={PHONE_STRIP_STYLE}
            onContentSizeChange={onContentSizeChange}
        >
            {cards}
        </ScrollView>
    )
}

// One row at every width, never wrapped: a wrapped strip pushed the panel below the fold.
export function BankAccountStrip(props: BankAccountStripProps) {
    const { rows, selectedId, currency, isWide, onSelect } = props
    if (!isWide) return <PhoneStrip {...props} />
    const cards = rows.map(row => (
        <BankAccountCard
            key={row.id}
            row={row}
            currency={currency}
            isSelected={row.id === selectedId}
            width={WIDE_CARD_WIDTH}
            onSelect={onSelect}
        />
    ))
    return (
        <ScrollView
            testID="bank-strip"
            horizontal
            showsHorizontalScrollIndicator={false}
            style={STRIP_STYLE}
            contentContainerStyle={WIDE_STRIP_STYLE}
        >
            {cards}
        </ScrollView>
    )
}
