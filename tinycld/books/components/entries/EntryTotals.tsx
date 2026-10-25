import { Text, View } from 'react-native'
import { type LineTotals, TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { formatMoney } from '../../lib/money'

interface EntryTotalsProps {
    totals: LineTotals
    currency: string
}

function balanceStatus(totals: LineTotals, currency: string) {
    if (totals.isTooLarge) return { text: TOO_LARGE_TEXT, tone: 'text-destructive' }
    if (totals.hasInvalid) return { text: 'Check the amounts', tone: 'text-destructive' }
    if (!totals.isBalanced) {
        const text = `Out of balance by ${formatMoney(totals.difference, currency)}`
        return { text, tone: 'text-destructive' }
    }
    return { text: 'In balance', tone: 'text-success' }
}

export function EntryTotals({ totals, currency }: EntryTotalsProps) {
    const status = balanceStatus(totals, currency)
    const sideText = (cents: number) =>
        totals.isTooLarge ? TOO_LARGE_TEXT : formatMoney(cents, currency)
    return (
        <View
            testID="entry-totals"
            className="flex-row flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border bg-surface-secondary px-4 py-2"
        >
            <View className="flex-row gap-1">
                <Text className="text-sm text-muted-foreground">Debits</Text>
                <Text testID="entry-total-debits" className="text-sm font-semibold text-foreground">
                    {sideText(totals.debits)}
                </Text>
            </View>
            <View className="flex-row gap-1">
                <Text className="text-sm text-muted-foreground">Credits</Text>
                <Text
                    testID="entry-total-credits"
                    className="text-sm font-semibold text-foreground"
                >
                    {sideText(totals.credits)}
                </Text>
            </View>
            <Text testID="entry-balance-status" className={`text-sm font-semibold ${status.tone}`}>
                {status.text}
            </Text>
        </View>
    )
}
