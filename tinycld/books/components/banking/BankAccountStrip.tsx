import { Pressable, ScrollView, Text, View } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import { PHONE_CARD_GAP, PHONE_CARD_WIDTH, useStripScroll } from '../../hooks/useStripScroll'
import { accountTypeDef } from '../../lib/account-types'
import {
    bankDetailsText,
    cardBalance,
    connectionLabel,
    waitingText,
} from '../../lib/bank-connections'

const WIDE_CARD_WIDTH = 280
// The phone strip's scroll position is computed from this gap, so it is a style, not a class.
const PHONE_STRIP_STYLE = { gap: PHONE_CARD_GAP }

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
    return (
        <Pressable
            testID={`bank-card-${row.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            // react-native-web writes no aria-selected from accessibilityState.
            aria-selected={isSelected}
            onPress={() => onSelect(row.id)}
            className={`gap-1 rounded-xl border bg-background p-4 ${border}`}
            style={{ width, borderWidth: isSelected ? 2 : 1 }}
        >
            <Text numberOfLines={1} className="text-base font-semibold text-foreground">
                {connectionLabel(row.accountNumber, row.accountName)}
            </Text>
            <Text className="text-xs text-muted-foreground">{typeLabel}</Text>
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
                {details}
            </Text>
            <Text className="pt-2 text-xs text-muted-foreground">In Books</Text>
            <Text className={`text-xl font-semibold tabular-nums ${balanceTone}`}>
                {balance.text}
            </Text>
            <Text className={`text-sm ${waitingTone}`}>{waitingText(row.waitingCount)}</Text>
        </Pressable>
    )
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
        <BankAccountCard
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
            contentContainerStyle={PHONE_STRIP_STYLE}
            onContentSizeChange={onContentSizeChange}
        >
            {cards}
        </ScrollView>
    )
}

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
        <View testID="bank-strip" className="flex-row flex-wrap gap-3">
            {cards}
        </View>
    )
}
