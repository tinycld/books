import { Text, View } from 'react-native'
import { splitRemainingText, splitTotalText } from '../../../lib/bank-categorize'

type SplitTotalsProps = {
    totals: { split: number; remaining: number }
    bankAmount: number
    currency: string
}

function RemainingLine({ text }: { text: string }) {
    if (!text) return null
    return <Text className="text-sm tabular-nums text-danger">{text}</Text>
}

// Under the split lines: "Split $970.00 of $970.00" and, when the lines do not add up,
// "Remaining $120.00" or "Over by $120.00" in the danger tone (splitTotals).
export function SplitTotals({ totals, bankAmount, currency }: SplitTotalsProps) {
    const totalText = splitTotalText(totals.split, bankAmount, currency)
    const remainingText = splitRemainingText(totals.remaining, currency)
    return (
        <View testID="bank-cat-totals" className="gap-0.5">
            <Text className="text-sm tabular-nums text-foreground">{totalText}</Text>
            <RemainingLine text={remainingText} />
        </View>
    )
}
