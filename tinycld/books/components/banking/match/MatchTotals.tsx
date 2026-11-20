import { Text, View } from 'react-native'
import type { matchTotals } from '../../../lib/bank-match'
import { formatMoney } from '../../../lib/money'

type Totals = ReturnType<typeof matchTotals>

function DifferenceLine({ difference, currency }: { difference: number; currency: string }) {
    if (difference === 0) return null
    const text = `Difference ${formatMoney(difference, currency)}`
    return <Text className="text-sm tabular-nums text-danger">{text}</Text>
}

// "Chosen $868.15 of $868.15", and the difference in the danger tone when they differ.
export function MatchTotals({
    totals,
    currency,
    isVisible,
}: {
    totals: Totals
    currency: string
    isVisible: boolean
}) {
    if (!isVisible) return null
    const chosen = formatMoney(totals.chosen, currency)
    const target = formatMoney(totals.target, currency)
    const text = `Chosen ${chosen} of ${target}`
    return (
        <View testID="bank-match-totals" className="gap-0.5">
            <Text className="text-sm tabular-nums text-foreground">{text}</Text>
            <DifferenceLine difference={totals.difference} currency={currency} />
        </View>
    )
}
